-- BOLT V35 · INSTALAÇÃO ÚNICA (inclui Portal da Família V34)
-- Execute todo o arquivo no SQL Editor do projeto Supabase atual.
-- Estrutura aditiva: nenhum cadastro existente é substituído.
begin;
-- Portal da Família: estrutura ADITIVA e privada. Não modifica alunos ou clientes.

create table if not exists public.bolt_family_accounts (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.bolt_commercial_clients(id) on delete cascade,
 student_id text not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 username text not null unique,
 auth_email text not null unique,
 guardian_fingerprint text not null,
 onboarding_secret text,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 activated_at timestamptz,
 unique(client_id,student_id),
 unique(user_id)
);
alter table public.bolt_family_accounts enable row level security;
revoke all on public.bolt_family_accounts from public,anon,authenticated;
grant select,insert,update,delete on public.bolt_family_accounts to service_role;
-- O servidor valida o vínculo da escola ou do responsável antes de qualquer operação.
-- onboarding_secret contém somente a senha inicial criptografada, apagada no primeiro login.


-- BOLT V35 · executar uma vez no SQL Editor. Aditivo e transacional.
-- Nenhum cliente ou usuário existente é substituído.

create table if not exists public.bolt_platform_plans (
 id uuid primary key default gen_random_uuid(), product text not null check(product in ('buy','class','church')),
 name text not null check(length(name) between 1 and 60), monthly_fee numeric(12,2) not null default 0 check(monthly_fee>=0),
 features jsonb not null default '[]' check(jsonb_typeof(features)='array'), updated_at timestamptz not null default now(), unique(product,name)
);
create table if not exists public.bolt_client_subscriptions (
 id uuid primary key default gen_random_uuid(), tenant_id uuid unique references public.bolt_tenants(id) on delete cascade,
 client_id uuid unique references public.bolt_commercial_clients(id) on delete cascade,
 plan_id uuid references public.bolt_platform_plans(id), monthly_fee numeric(12,2) not null check(monthly_fee>=0),
 status text not null default 'active' check(status in ('active','trial','paused','cancelled')),
 updated_at timestamptz not null default now(), check(num_nonnulls(tenant_id,client_id)=1)
);
create table if not exists public.bolt_client_invoices (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.bolt_client_subscriptions(id) on delete cascade,
 due_date date not null, amount numeric(12,2) not null check(amount>=0), paid_at timestamptz,
 created_at timestamptz not null default now(), unique(subscription_id,due_date)
);
create table if not exists public.bolt_support_tickets (
 id uuid primary key default gen_random_uuid(), tenant_id uuid references public.bolt_tenants(id) on delete cascade,
 client_id uuid references public.bolt_commercial_clients(id) on delete cascade,
 requester_id uuid, requester_name text not null check(length(requester_name) between 1 and 120),
 contact text not null default '' check(length(contact)<=180),
 source text not null check(source in ('admin','family','member','consumer')),
 verified boolean not null default false, subject text not null check(length(subject) between 3 and 120),
 message text not null check(length(message) between 10 and 3000),
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 response text not null default '' check(length(response)<=3000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(num_nonnulls(tenant_id,client_id)=1)
);
create table if not exists public.bolt_church_member_accounts (
 id uuid primary key default gen_random_uuid(),client_id uuid not null references public.bolt_commercial_clients(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,member_id text not null,member_fingerprint text not null,
 created_at timestamptz not null default now(),unique(client_id,member_id),unique(user_id)
);
create index if not exists bolt_support_client_idx on public.bolt_support_tickets(client_id,created_at desc);
create index if not exists bolt_support_tenant_idx on public.bolt_support_tickets(tenant_id,created_at desc);
create table if not exists public.bolt_support_rate_limits (key text primary key, day date not null default current_date, hits integer not null default 1);
-- Limitação atômica, sem guardar o IP em texto. Registros antigos são removidos.
create or replace function public.bolt_support_allow(p_key text) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare n integer;
begin
 delete from public.bolt_support_rate_limits where day<current_date-2;
 insert into public.bolt_support_rate_limits(key,day,hits) values(p_key,current_date,1)
 on conflict(key) do update set hits=case when bolt_support_rate_limits.day=current_date then bolt_support_rate_limits.hits+1 else 1 end,day=current_date
 returning hits into n;
 return n<=10;
end $$;
-- Tamanho lógico serializado dos registros atribuíveis, não alocação física por cliente.
-- Inclui armazenamento Storage nos dois buckets BOLT. Não lê dados de outros aplicativos.
create or replace function public.bolt_platform_usage() returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c record; t record; data_bytes bigint; n bigint; file_bytes bigint; results jsonb:='[]'; total_storage bigint;
begin
 for c in select id,slug,'buy'::text product from public.bolt_tenants union all select id,slug,product from public.bolt_commercial_clients loop
 data_bytes:=0;
 for t in select * from (values
 ('bolt_tenants','id','buy'),('bolt_products','tenant_id','buy'),('bolt_orders','tenant_id','buy'),('bolt_coupons','tenant_id','buy'),('bolt_memberships','tenant_id','buy'),('bolt_loyalty_settings','tenant_id','buy'),('bolt_audit_events','tenant_id','buy'),('bolt_delivery_storefronts','tenant_id','buy'),
 ('bolt_commercial_clients','id','commercial'),('bolt_commercial_workspaces','client_id','commercial'),('bolt_client_branding','client_id','commercial'),('bolt_client_studio_settings','client_id','commercial'),('bolt_commercial_memberships','client_id','commercial'),('bolt_family_accounts','client_id','commercial'),('bolt_church_member_accounts','client_id','commercial'),
 ('bolt_client_subscriptions','tenant_id','buy'),('bolt_client_subscriptions','client_id','commercial'),('bolt_support_tickets','tenant_id','buy'),('bolt_support_tickets','client_id','commercial')
 ) v(tab,col,kind) where kind=case when c.product='buy' then 'buy' else 'commercial' end loop
 if to_regclass('public.'||t.tab) is not null then
 execute format('select coalesce(sum(octet_length(to_jsonb(r)::text)),0) from public.%I r where %I=$1',t.tab,t.col) into n using c.id;
 data_bytes:=data_bytes+n;
 end if;
 end loop;
 select coalesce(sum(octet_length(to_jsonb(i)::text)),0) into n from public.bolt_client_invoices i join public.bolt_client_subscriptions s on s.id=i.subscription_id where s.tenant_id=c.id or s.client_id=c.id;
 data_bytes:=data_bytes+n;
 if c.product='buy' and to_regclass('public.bolt_order_items') is not null then
 execute 'select coalesce(sum(octet_length(to_jsonb(i)::text)),0) from public.bolt_order_items i join public.bolt_orders o on o.id=i.order_id where o.tenant_id=$1' into n using c.id;
 data_bytes:=data_bytes+n;
 end if;
 select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) into file_bytes from storage.objects where bucket_id in ('bolt-branding','bolt-product-images') and split_part(name,'/',1)=c.id::text;
 results:=results||jsonb_build_array(jsonb_build_object('id',c.id,'product',c.product,'logical_bytes',data_bytes,'storage_bytes',file_bytes));
 end loop;
 select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) into total_storage from storage.objects;
 return jsonb_build_object('clients',results,'database_bytes',pg_database_size(current_database()),'storage_bytes',total_storage,'measured_at',now());
end $$;
-- Sem acesso público às tabelas ou RPCs administrativas.
do $$ declare t text; begin
 foreach t in array array['bolt_platform_plans','bolt_client_subscriptions','bolt_client_invoices','bolt_support_tickets','bolt_support_rate_limits','bolt_church_member_accounts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.bolt_support_allow(text),public.bolt_platform_usage() from public,anon,authenticated;
grant execute on function public.bolt_support_allow(text),public.bolt_platform_usage() to service_role;

create or replace function public.bolt_buy_feature(p_tenant uuid,p_feature text) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.bolt_master_admins where user_id=auth.uid()) or (
 exists(select 1 from public.bolt_memberships where tenant_id=p_tenant and user_id=auth.uid()) and
 exists(select 1 from public.bolt_tenants where id=p_tenant and status not in ('suspenso','paused')) and
 not exists(select 1 from public.bolt_client_subscriptions s join public.bolt_platform_plans p on p.id=s.plan_id where s.tenant_id=p_tenant and not(p.features ? p_feature))
 );
$$;
revoke all on function public.bolt_buy_feature(uuid,text) from public,anon;
grant execute on function public.bolt_buy_feature(uuid,text) to authenticated;
-- Restritiva: complementa as políticas existentes, sem liberar acesso novo.
drop policy if exists bolt_v35_products_insert on public.bolt_products;
create policy bolt_v35_products_insert on public.bolt_products as restrictive for insert to authenticated with check(public.bolt_buy_feature(tenant_id,'products'));
drop policy if exists bolt_v35_products_update on public.bolt_products;
create policy bolt_v35_products_update on public.bolt_products as restrictive for update to authenticated using(public.bolt_buy_feature(tenant_id,'products')) with check(public.bolt_buy_feature(tenant_id,'products'));
drop policy if exists bolt_v35_products_delete on public.bolt_products;
create policy bolt_v35_products_delete on public.bolt_products as restrictive for delete to authenticated using(public.bolt_buy_feature(tenant_id,'products'));


commit;
