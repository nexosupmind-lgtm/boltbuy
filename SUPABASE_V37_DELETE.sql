begin;

-- Preserve the order snapshot when its coupon is removed.
alter table public.bolt_orders
  drop constraint if exists bolt_orders_coupon_id_fkey;
alter table public.bolt_orders
  add constraint bolt_orders_coupon_id_fkey
  foreign key (coupon_id) references public.bolt_coupons(id) on delete set null;

-- Only the server credential needs to delete these parent records.
grant delete on public.bolt_tenants, public.bolt_commercial_clients to service_role;

commit;
