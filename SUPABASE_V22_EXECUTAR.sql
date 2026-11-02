-- BOLT V22: cadastro COMERCIAL de clientes Church e Class.
-- Não altera tabelas BOLTBUY nem migra dados dos sistemas operacionais.
create extension if not exists pgcrypto;
create table if not exists public.bolt_commercial_clients (
 id uuid primary key default gen_random_uuid(),
 product text not null check (product in ('church','class')),
 name text not null check (length(trim(name)) > 0),
 slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 status text not null default 'prospect' check (status in ('prospect','active','paused')),
 created_at timestamptz not null default now(),
 unique (product,slug)
);
alter table public.bolt_commercial_clients enable row level security;
drop policy if exists bolt_commercial_master_only on public.bolt_commercial_clients;
create policy bolt_commercial_master_only on public.bolt_commercial_clients
 for all to authenticated
 using (exists (select 1 from public.bolt_master_admins m where m.user_id = (select auth.uid())))
 with check (exists (select 1 from public.bolt_master_admins m where m.user_id = (select auth.uid())));
grant select,insert,update,delete on public.bolt_commercial_clients to authenticated;
