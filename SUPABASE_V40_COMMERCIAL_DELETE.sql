begin;

alter table public.bolt_client_branding
  drop constraint bolt_client_branding_client_id_fkey,
  add constraint bolt_client_branding_client_id_fkey
    foreign key (client_id)
    references public.bolt_commercial_clients (id)
    on delete cascade;

alter table public.bolt_client_studio_settings
  drop constraint bolt_client_studio_settings_client_id_fkey,
  add constraint bolt_client_studio_settings_client_id_fkey
    foreign key (client_id)
    references public.bolt_commercial_clients (id)
    on delete cascade;

alter table public.bolt_commercial_memberships
  drop constraint bolt_commercial_memberships_client_id_fkey,
  add constraint bolt_commercial_memberships_client_id_fkey
    foreign key (client_id)
    references public.bolt_commercial_clients (id)
    on delete cascade;

commit;
