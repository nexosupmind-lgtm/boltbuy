-- BOLT Barber. Run after the BOLT Master V35 migrations.
begin;

alter table public.bolt_commercial_clients
  drop constraint bolt_commercial_clients_product_check,
  add constraint bolt_commercial_clients_product_check
    check (product in ('church', 'class', 'barber'));
alter table public.bolt_platform_plans
  drop constraint bolt_platform_plans_product_check,
  add constraint bolt_platform_plans_product_check
    check (product in ('buy', 'class', 'church', 'barber'));

create table public.bolt_barber_workspaces (
  client_id uuid primary key references public.bolt_commercial_clients(id),
  revision uuid not null default gen_random_uuid(),
  state jsonb not null check (jsonb_typeof(state) = 'object')
);
alter table public.bolt_barber_workspaces enable row level security;
revoke all on public.bolt_barber_workspaces from public, anon, authenticated;
grant select, insert, update on public.bolt_barber_workspaces to service_role;

insert into public.bolt_platform_plans (product, name, monthly_fee, features)
values ('barber', 'Pro', 0, '["bookings","customers","reports","ledger","catalog"]')
on conflict (product, name) do nothing;
create function public.bolt_barber_install_demo(p_state jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  demo_id uuid;
  pro_id uuid;
begin
  insert into public.bolt_commercial_clients (product, name, slug, status)
    values ('barber', 'BOLTBARBER DEMO', 'boltbarber-demo', 'active')
    on conflict (product,slug) do nothing;
  select id into strict demo_id from public.bolt_commercial_clients
    where product = 'barber' and slug = 'boltbarber-demo' and name = 'BOLTBARBER DEMO';
  select id into strict pro_id from public.bolt_platform_plans where product = 'barber' and name = 'Pro';
  insert into public.bolt_client_subscriptions (client_id, plan_id, monthly_fee, status)
    values (demo_id, pro_id, 0, 'active') on conflict (client_id) do nothing;
  insert into public.bolt_barber_workspaces (client_id, state)
    values (demo_id, p_state) on conflict (client_id) do nothing;
end;
$$;
revoke all on function public.bolt_barber_install_demo(jsonb) from public, anon, authenticated;
grant execute on function public.bolt_barber_install_demo(jsonb) to service_role;
commit;
