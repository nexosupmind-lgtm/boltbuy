-- BOLT V20: permissões mínimas para persistência de empresas e catálogo.
-- Não remove registros existentes. Reexecutável.
ALTER TABLE public.bolt_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bolt_master_admins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bolt_v20_master_insert ON public.bolt_tenants;
CREATE POLICY bolt_v20_master_insert ON public.bolt_tenants FOR INSERT TO authenticated
WITH CHECK (EXISTS(SELECT 1 FROM public.bolt_master_admins a WHERE a.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS bolt_v20_master_update ON public.bolt_tenants;
CREATE POLICY bolt_v20_master_update ON public.bolt_tenants FOR UPDATE TO authenticated
USING (EXISTS(SELECT 1 FROM public.bolt_master_admins a WHERE a.user_id=(SELECT auth.uid())))
WITH CHECK (EXISTS(SELECT 1 FROM public.bolt_master_admins a WHERE a.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS bolt_v20_master_read ON public.bolt_tenants;
CREATE POLICY bolt_v20_master_read ON public.bolt_tenants FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.bolt_master_admins a WHERE a.user_id=(SELECT auth.uid())));
ALTER TABLE public.bolt_products ADD COLUMN IF NOT EXISTS emoji text DEFAULT '🥟';
ALTER TABLE public.bolt_products ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
DROP POLICY IF EXISTS bolt_v20_catalog_read ON public.bolt_products;
CREATE POLICY bolt_v20_catalog_read ON public.bolt_products FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS bolt_v20_catalog_insert ON public.bolt_products;
CREATE POLICY bolt_v20_catalog_insert ON public.bolt_products FOR INSERT TO authenticated
WITH CHECK (EXISTS(SELECT 1 FROM public.bolt_memberships m WHERE m.tenant_id=bolt_products.tenant_id AND m.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS bolt_v20_catalog_update ON public.bolt_products;
CREATE POLICY bolt_v20_catalog_update ON public.bolt_products FOR UPDATE TO authenticated
USING (EXISTS(SELECT 1 FROM public.bolt_memberships m WHERE m.tenant_id=bolt_products.tenant_id AND m.user_id=(SELECT auth.uid())))
WITH CHECK (EXISTS(SELECT 1 FROM public.bolt_memberships m WHERE m.tenant_id=bolt_products.tenant_id AND m.user_id=(SELECT auth.uid())));
-- Não expor pedidos/dados pessoais de consumidores publicamente.
