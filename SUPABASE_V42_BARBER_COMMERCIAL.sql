-- Apply after V41. Existing plans and subscriptions retain legacy access.
begin;

alter table public.bolt_platform_plans add column barber_terms jsonb;
alter table public.bolt_client_subscriptions add column barber_addons integer not null default 0
  check (barber_addons between 0 and 99);

alter table public.bolt_platform_plans add constraint bolt_barber_terms_valid check (
  barber_terms is null or (
    product = 'barber' and jsonb_typeof(barber_terms) = 'object'
    and barber_terms ?& array['implementation_fee','included_barbers','max_addons','addon_fee','customizations','monthly_commission']
    and coalesce((
      (barber_terms->>'included_barbers')::integer between 1 and 100
      and (barber_terms->>'max_addons')::integer between 0 and 99
      and (barber_terms->>'included_barbers')::integer + (barber_terms->>'max_addons')::integer <= 100
      and (barber_terms->>'customizations')::integer between 0 and 100
      and (barber_terms->>'implementation_fee')::numeric between 0 and 9999999999.99
      and (barber_terms->>'addon_fee')::numeric between 0 and 9999999999.99
      and (barber_terms->>'monthly_commission')::numeric between 0 and 9999999999.99
      and features ?& array['bookings','customers','catalog','finance']
    ), false)
  )
);

insert into public.bolt_platform_plans(product,name,monthly_fee,features,barber_terms) values
 ('barber','BRONZE',59.90,'["bookings","customers","catalog","finance"]',
  '{"implementation_fee":250,"included_barbers":1,"max_addons":0,"addon_fee":0,"customizations":0,"monthly_commission":9.90}'),
 ('barber','OURO',99.90,'["bookings","customers","catalog","finance","reports","ranking"]',
  '{"implementation_fee":350,"included_barbers":3,"max_addons":2,"addon_fee":14.90,"customizations":0,"monthly_commission":19.90}'),
 ('barber','DIAMANTE',139.90,'["bookings","customers","catalog","finance","reports","ranking","advanced_reports","ledger"]',
  '{"implementation_fee":450,"included_barbers":10,"max_addons":0,"addon_fee":0,"customizations":3,"monthly_commission":39.90}')
on conflict(product,name) do nothing;

-- Enforce changes to either side of the workspace/subscription relationship.
create function public.bolt_barber_capacity_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog,public as $$
declare
  client_key uuid;
  plan_key uuid;
  addons integer;
  roster jsonb;
  terms jsonb;
  active_total integer;
begin
  client_key := new.client_id;
  if client_key is null then return new; end if;
  perform 1 from public.bolt_commercial_clients where id=client_key and product='barber' for update;
  if not found then return new; end if;
  if tg_table_name='bolt_barber_workspaces' then
    select plan_id, barber_addons into plan_key, addons
      from public.bolt_client_subscriptions where client_id=client_key;
    roster := new.state->'barbers';
  else
    plan_key := new.plan_id;
    addons := new.barber_addons;
    select state->'barbers' into roster from public.bolt_barber_workspaces where client_id=client_key;
  end if;
  if plan_key is null then raise exception 'Vincule um plano BOLT Barber.' using errcode='23514'; end if;
  select barber_terms into terms from public.bolt_platform_plans where id=plan_key and product='barber' for share;
  if not found then raise exception 'Plano de outro produto.' using errcode='23514'; end if;
  if terms is null then
    if addons <> 0 then raise exception 'Plano legado sem adicionais.' using errcode='23514'; end if;
    return new;
  end if;
  select count(*) into active_total from jsonb_array_elements(coalesce(roster,'[]'::jsonb)) b where b->'active'='true'::jsonb;
  if addons > (terms->>'max_addons')::integer or active_total > (terms->>'included_barbers')::integer + addons then
    raise exception 'Limite de barbeiros do plano excedido.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.bolt_barber_capacity_guard() from public,anon,authenticated;
create trigger bolt_barber_workspace_capacity before insert or update of state on public.bolt_barber_workspaces
  for each row execute function public.bolt_barber_capacity_guard();
create trigger bolt_barber_subscription_capacity before insert or update of client_id,plan_id,barber_addons on public.bolt_client_subscriptions
  for each row execute function public.bolt_barber_capacity_guard();

-- Prevent edits that would invalidate a currently assigned capacity.
create function public.bolt_barber_plan_capacity_guard() returns trigger
language plpgsql security definer set search_path = pg_catalog,public as $$
begin
  if old.barber_terms is not null and new.barber_terms is null then
    raise exception 'As condições comerciais do plano não podem ser removidas.' using errcode='23514';
  end if;
  if new.barber_terms is not null and exists (
    select 1 from public.bolt_client_subscriptions s
    left join public.bolt_barber_workspaces w on w.client_id=s.client_id
    where s.plan_id=new.id and (
      s.barber_addons > (new.barber_terms->>'max_addons')::integer
      or (select count(*) from jsonb_array_elements(coalesce(w.state->'barbers','[]'::jsonb)) b where b->'active'='true'::jsonb)
         > (new.barber_terms->>'included_barbers')::integer + s.barber_addons
    )
  ) then raise exception 'Um cliente já ultrapassa o novo limite do plano.' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.bolt_barber_plan_capacity_guard() from public,anon,authenticated;
create trigger bolt_barber_plan_capacity before update of barber_terms on public.bolt_platform_plans
  for each row execute function public.bolt_barber_plan_capacity_guard();

commit;
