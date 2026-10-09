-- Harden database function execution and add indexes for foreign-key joins.
-- Trigger functions execute as triggers without granting client RPC access.
alter function public.touch_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_memorial_after_completion() from public, anon, authenticated;
revoke execute on function public.validate_order_price() from public, anon, authenticated;
revoke execute on function public.validate_order_transition() from public, anon, authenticated;

-- RLS policies call this helper. It only reports whether the current signed-in user is an admin.
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create index if not exists care_pricing_service_id_idx on public.care_pricing(service_id);
create index if not exists memorials_cemetery_id_idx on public.memorials(cemetery_id);
create index if not exists memorials_client_id_idx on public.memorials(client_id);
create index if not exists notifications_profile_id_idx on public.notifications(profile_id);
create index if not exists order_assessments_assessed_by_idx on public.order_assessments(assessed_by);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_photos_order_id_idx on public.order_photos(order_id);
create index if not exists orders_client_id_idx on public.orders(client_id);
create index if not exists orders_executor_id_idx on public.orders(executor_id);
create index if not exists orders_memorial_id_idx on public.orders(memorial_id);
create index if not exists orders_service_id_idx on public.orders(service_id);
create index if not exists subscriptions_client_id_idx on public.subscriptions(client_id);
create index if not exists subscriptions_memorial_id_idx on public.subscriptions(memorial_id);
