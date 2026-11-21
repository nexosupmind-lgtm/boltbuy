-- Apply after V42. This migration does not create payments or start any schedule.
begin;
alter table public.bolt_client_invoices
  add column billing_kind text not null default 'legacy' check (billing_kind in ('legacy','implementation','monthly')),
  add column commission_due numeric(12,2) not null default 0 check (commission_due >= 0);
create unique index bolt_barber_one_implementation on public.bolt_client_invoices(subscription_id)
  where billing_kind='implementation';

create table public.bolt_partner_access (
  user_id uuid not null references auth.users(id),
  product text not null check(product in ('barber','class')),
  partner text not null check((product='barber' and partner='samuel') or (product='class' and partner='cesar')),
  primary key (user_id,product),
  unique (user_id),
  unique (product)
);
create table public.bolt_commission_payouts (
  id uuid primary key default gen_random_uuid(),
  month date unique not null check (extract(day from month)=1),
  recorded_at timestamptz not null default now(),
  recorded_by uuid not null,
  reference text not null check(length(trim(reference)) between 1 and 120)
);
create table public.bolt_commissions (
  invoice_id uuid primary key references public.bolt_client_invoices(id) on delete restrict,
  amount numeric(12,2) not null check (amount>0),
  earned_at timestamptz not null,
  payout_id uuid references public.bolt_commission_payouts(id)
);
create table public.bolt_product_expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  description text not null check (length(trim(description)) between 1 and 160),
  category text not null check (category in ('infrastructure','tax','fee','other')),
  cents integer not null check(cents>0),
  products text[] not null check(cardinality(products) between 1 and 4 and products <@ array['buy','class','church','barber']),
  paid boolean not null,
  actor uuid not null,
  created_at timestamptz not null default now()
);
create table public.bolt_financial_audit (
  id bigint generated always as identity primary key,
  event text not null,
  subject uuid not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.bolt_partner_access enable row level security;
alter table public.bolt_commission_payouts enable row level security;
alter table public.bolt_commissions enable row level security;
alter table public.bolt_product_expenses enable row level security;
alter table public.bolt_financial_audit enable row level security;
revoke all on public.bolt_partner_access, public.bolt_commission_payouts, public.bolt_commissions,
  public.bolt_product_expenses, public.bolt_financial_audit from public,anon,authenticated;
grant select,insert on public.bolt_product_expenses to service_role;
grant select,insert,update on public.bolt_partner_access to service_role;
grant select on public.bolt_commissions,public.bolt_commission_payouts,public.bolt_financial_audit to service_role;

create function public.bolt_invoice_commission_snapshot() returns trigger
language plpgsql security definer set search_path = pg_catalog,public as $$
declare
  terms jsonb;
  implementation_due date;
begin
  if new.billing_kind='legacy' then return new; end if;
  select p.barber_terms into terms
    from public.bolt_client_subscriptions s join public.bolt_platform_plans p on p.id=s.plan_id
    join public.bolt_commercial_clients c on c.id=s.client_id
    where s.id=new.subscription_id and c.product='barber' and p.product='barber';
  if terms is null then raise exception 'A cobrança exige um plano comercial do Barber.' using errcode='23514'; end if;
  if new.billing_kind='monthly' then
    select due_date into implementation_due from public.bolt_client_invoices
      where subscription_id=new.subscription_id and billing_kind='implementation';
    if implementation_due is null or new.due_date < (implementation_due + interval '1 month')::date then
      raise exception 'A mensalidade começa no segundo mês da implantação.' using errcode='23514';
    end if;
  end if;
  new.commission_due := case new.billing_kind when 'implementation' then 150 else (terms->>'monthly_commission')::numeric end;
  return new;
end $$;
revoke all on function public.bolt_invoice_commission_snapshot() from public,anon,authenticated;
create trigger bolt_invoice_commission_snapshot before insert on public.bolt_client_invoices
  for each row execute function public.bolt_invoice_commission_snapshot();

create function public.bolt_financial_record() returns trigger
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if tg_table_name='bolt_client_invoices' then
    if tg_op='INSERT' then
      insert into public.bolt_financial_audit(event,subject,metadata)
        values ('invoice_created',new.id,jsonb_build_object('amount',new.amount,'kind',new.billing_kind));
    elsif old.paid_at is distinct from new.paid_at then
      insert into public.bolt_financial_audit(event,subject,metadata)
        values ('payment_updated',new.id,jsonb_build_object('paid_at',new.paid_at,'amount',new.amount));
      if old.paid_at is null and new.paid_at is not null and new.amount>0 and new.commission_due>0 then
        insert into public.bolt_commissions(invoice_id,amount,earned_at)
          values(new.id,new.commission_due,new.paid_at) on conflict(invoice_id) do nothing;
      end if;
    end if;
  elsif tg_table_name='bolt_product_expenses' then
    insert into public.bolt_financial_audit(event,subject,metadata)
      values ('expense_created',new.id,jsonb_build_object('actor',new.actor,'cents',new.cents,'products',new.products));
  elsif tg_table_name='bolt_partner_access' then
    insert into public.bolt_financial_audit(event,subject,metadata)
      values ('partner_access_changed',new.user_id,jsonb_build_object('product',new.product,'partner',new.partner));
  elsif tg_table_name='bolt_client_subscriptions' then
    insert into public.bolt_financial_audit(event,subject,metadata)
      values ('subscription_changed',new.id,jsonb_build_object('plan_id',new.plan_id,'status',new.status,'monthly_fee',new.monthly_fee,'barber_addons',new.barber_addons));
  end if;
  return new;
end $$;
revoke all on function public.bolt_financial_record() from public,anon,authenticated;
create trigger bolt_invoice_financial_audit after insert or update of paid_at on public.bolt_client_invoices
 for each row execute function public.bolt_financial_record();
create trigger bolt_expense_financial_audit after insert on public.bolt_product_expenses
 for each row execute function public.bolt_financial_record();
create trigger bolt_partner_financial_audit after insert or update on public.bolt_partner_access
 for each row execute function public.bolt_financial_record();
create trigger bolt_subscription_financial_audit after insert or update of plan_id,status,monthly_fee,barber_addons on public.bolt_client_subscriptions
 for each row execute function public.bolt_financial_record();

create function public.bolt_record_commission_payout(p_month date,p_actor uuid,p_reference text) returns uuid
language plpgsql security definer set search_path = pg_catalog,public as $$
declare payout uuid;
begin
  if not exists(select 1 from public.bolt_master_admins where user_id=p_actor) then raise exception 'Acesso negado.'; end if;
  if p_month >= date_trunc('month',now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O repasse consolidado exige um mês encerrado.';
  end if;
  insert into public.bolt_commission_payouts(month,recorded_by,reference)
    values(p_month,p_actor,p_reference) returning id into payout;
  update public.bolt_commissions set payout_id=payout
    where payout_id is null and (earned_at at time zone 'America/Sao_Paulo')::date < (p_month+interval '1 month')::date;
  if not found then raise exception 'Sem comissões pendentes no período.'; end if;
  insert into public.bolt_financial_audit(event,subject,metadata)
    values ('payout_recorded',payout,jsonb_build_object('actor',p_actor,'month',p_month));
  return payout;
end $$;
revoke all on function public.bolt_record_commission_payout(date,uuid,text) from public,anon,authenticated;
grant execute on function public.bolt_record_commission_payout(date,uuid,text) to service_role;
commit;
