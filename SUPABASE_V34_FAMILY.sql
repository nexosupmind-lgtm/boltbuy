-- Portal da Família: estrutura ADITIVA e privada. Não modifica alunos ou clientes.
begin;
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
commit;
