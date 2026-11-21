-- Sandbox events are deliberately isolated from real invoices and client access.
begin;
create table public.bolt_asaas_sandbox_events (
  event_id text primary key check(length(event_id) between 1 and 150),
  payment_id text not null check(length(payment_id) between 1 and 150),
  event_type text not null check(length(event_type) between 1 and 80),
  verified_status text not null check(length(verified_status) between 1 and 60),
  checked_at timestamptz not null default now()
);
alter table public.bolt_asaas_sandbox_events enable row level security;
revoke all on public.bolt_asaas_sandbox_events from public,anon,authenticated;
grant select,insert on public.bolt_asaas_sandbox_events to service_role;
commit;
