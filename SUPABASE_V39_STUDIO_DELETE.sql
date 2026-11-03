begin;

alter table public.bolt_client_studio_settings
  drop constraint bolt_client_studio_settings_client_id_fkey,
  add constraint bolt_client_studio_settings_client_id_fkey
    foreign key (client_id)
    references public.bolt_commercial_clients (id)
    on delete cascade;

commit;
