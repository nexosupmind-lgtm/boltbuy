-- BOLT CLOUD v9 — Execute integralmente no SQL Editor do Supabase.
-- Após criar seu usuário em Authentication > Users, substitua o e-mail na instrução FINAL.
create extension if not exists pgcrypto;
create table if not exists public.bolt_tenants (
 id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9-]{3,50}$'),
 name text not null, owner_name text, logo_url text, primary_color text default '#7c3aed',
 background_color text default '#0b1020', tagline text, plan text, status text default 'teste', created_at timestamptz not null default now()
);
create table if not exists public.bolt_memberships (
 tenant_id uuid not null references public.bolt_tenants(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('owner','manager','staff')),
 primary key (tenant_id,user_id)
);
create table if not exists public.bolt_master_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.bolt_products (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.bolt_tenants(id) on delete cascade,
 name text not null, category text, price numeric(12,2) not null check(price>=0),
 image_url text, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.bolt_coupons (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.bolt_tenants(id) on delete cascade,
 code text not null, kind text not null check(kind in ('percent','fixed')),
 amount numeric(12,2) not null check(amount>0), minimum_order numeric(12,2) not null default 0,
 expires_at timestamptz, max_uses integer check(max_uses>=0), uses integer not null default 0,
 active boolean not null default true, unique(tenant_id,code)
);
create table if not exists public.bolt_orders (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.bolt_tenants(id) on delete cascade,
 customer_name text not null, customer_phone text, delivery_address text, status text not null default 'recebido',
 subtotal numeric(12,2) not null default 0, delivery_fee numeric(12,2) not null default 0,
 discount numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 coupon_id uuid references public.bolt_coupons(id), created_at timestamptz not null default now()
);
create table if not exists public.bolt_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.bolt_orders(id) on delete cascade,
 product_id uuid references public.bolt_products(id) on delete set null, product_name text not null,
 quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0)
);
create table if not exists public.bolt_loyalty_settings (
 tenant_id uuid primary key references public.bolt_tenants(id) on delete cascade,
 enabled boolean not null default false, target_orders integer not null default 5 check(target_orders>=2),
 reward_amount numeric(12,2) not null default 10 check(reward_amount>0)
);
create table if not exists public.bolt_audit_events (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.bolt_tenants(id) on delete cascade,
 actor_id uuid references auth.users(id), event_type text not null, details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
alter table public.bolt_master_admins enable row level security;
alter table public.bolt_tenants enable row level security;
alter table public.bolt_memberships enable row level security;
alter table public.bolt_products enable row level security;
alter table public.bolt_coupons enable row level security;
alter table public.bolt_orders enable row level security;
alter table public.bolt_order_items enable row level security;
alter table public.bolt_loyalty_settings enable row level security;
alter table public.bolt_audit_events enable row level security;
-- Cada usuário só consegue consultar seu próprio registro de acesso.
drop policy if exists "bolt_master_self" on public.bolt_master_admins;
create policy "bolt_master_self" on public.bolt_master_admins for select to authenticated using (user_id=auth.uid());
drop policy if exists "bolt_memberships_self" on public.bolt_memberships;
create policy "bolt_memberships_self" on public.bolt_memberships for select to authenticated using (user_id=auth.uid());
drop policy if exists "bolt_tenant_member_read" on public.bolt_tenants;
create policy "bolt_tenant_member_read" on public.bolt_tenants for select to authenticated using (
 exists (select 1 from public.bolt_memberships m where m.tenant_id=id and m.user_id=auth.uid())
);
-- Dados de produtos/pedidos/cupons permanecem BLOQUEADOS para acesso direto via navegador.
-- A integração transacional segura desses módulos ainda não foi implementada.
-- IMPORTANTE: troque o e-mail pelo e-mail da SUA conta criada no Supabase Authentication.
-- EXECUTE a instrução abaixo SOMENTE depois de criar a conta de usuário.
-- insert into public.bolt_master_admins(user_id)
-- select id from auth.users where email='SEU_EMAIL_AQUI' on conflict do nothing;
