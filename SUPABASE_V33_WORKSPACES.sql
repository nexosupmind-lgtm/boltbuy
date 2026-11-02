-- Estrutura ADITIVA: não altera clientes, usuários, produtos ou registros existentes.
-- Execute no SQL Editor do mesmo projeto usado pelo BOLT.
begin;
create table if not exists public.bolt_commercial_workspaces (
 client_id uuid primary key references public.bolt_commercial_clients(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object'),
 revision integer not null default 1 check (revision > 0),
 updated_at timestamptz not null default now()
);
alter table public.bolt_commercial_workspaces enable row level security;
-- Dados operacionais privados. Apenas a API do servidor pode acessá-los.
-- A API verifica usuário, vínculo, nicho e situação antes de toda leitura/escrita.
revoke all on public.bolt_commercial_workspaces from anon, authenticated;
grant select, insert, update on public.bolt_commercial_workspaces to service_role;
commit;

-- Somente a vitrine pública: nenhum pedido, telefone ou dado pessoal é armazenado aqui.
begin;
create table if not exists public.bolt_delivery_storefronts (
 tenant_id uuid primary key references public.bolt_tenants(id) on delete cascade,
 settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings)='object'),
 updated_at timestamptz not null default now()
);
alter table public.bolt_delivery_storefronts enable row level security;
drop policy if exists bolt_storefront_public_read on public.bolt_delivery_storefronts;
create policy bolt_storefront_public_read on public.bolt_delivery_storefronts for select to anon,authenticated using (true);
drop policy if exists bolt_storefront_master_write on public.bolt_delivery_storefronts;
create policy bolt_storefront_master_write on public.bolt_delivery_storefronts for all to authenticated
 using (exists(select 1 from public.bolt_master_admins a where a.user_id=(select auth.uid())))
 with check (exists(select 1 from public.bolt_master_admins a where a.user_id=(select auth.uid())));
grant select on public.bolt_delivery_storefronts to anon;
grant select,insert,update on public.bolt_delivery_storefronts to authenticated;
commit;
