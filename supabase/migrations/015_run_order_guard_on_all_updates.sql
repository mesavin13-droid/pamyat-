-- The executor guard must run for edits to any order field, not only status changes.
drop trigger if exists orders_validate_transition on public.orders;
create trigger orders_validate_transition
before insert or update on public.orders
for each row execute function public.validate_order_transition();
