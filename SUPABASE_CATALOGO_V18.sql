-- BOLT V18: leitura pública de lojas ativas e catálogo, escrita apenas por membros da loja.
-- Revise antes de executar. Não altera pedidos.
alter table public.bolt_products add column if not exists emoji text default '🥟';
alter table public.bolt_products add column if not exists featured boolean not null default false;
alter table public.bolt_products enable row level security;
-- O catálogo e o nome da loja são públicos, como em qualquer vitrine de delivery.
drop policy if exists bolt_v18_public_tenant_read on public.bolt_tenants;
create policy bolt_v18_public_tenant_read on public.bolt_tenants for select to anon, authenticated using (true);
drop policy if exists bolt_v18_public_products_read on public.bolt_products;
create policy bolt_v18_public_products_read on public.bolt_products for select to anon, authenticated using (true);
drop policy if exists bolt_v18_member_insert on public.bolt_products;
create policy bolt_v18_member_insert on public.bolt_products for insert to authenticated with check (exists(select 1 from public.bolt_memberships m where m.tenant_id=bolt_products.tenant_id and m.user_id=auth.uid()));
drop policy if exists bolt_v18_member_update on public.bolt_products;
create policy bolt_v18_member_update on public.bolt_products for update to authenticated using (exists(select 1 from public.bolt_memberships m where m.tenant_id=bolt_products.tenant_id and m.user_id=auth.uid())) with check (exists(select 1 from public.bolt_memberships m where m.tenant_id=bolt_products.tenant_id and m.user_id=auth.uid()));
