-- BOLT: permite que somente o Master autenticado consulte as empresas.
-- Não apaga, não altera e não cria registros.
create policy bolt_master_read_tenants on public.bolt_tenants
for select to authenticated using (
  exists (select 1 from public.bolt_master_admins a where a.user_id = (select auth.uid()))
);
