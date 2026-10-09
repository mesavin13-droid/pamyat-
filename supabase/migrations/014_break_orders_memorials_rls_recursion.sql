-- Break cross-table RLS recursion between orders and memorials.
-- validate_order_price() already verifies memorial ownership against new.client_id (as SECURITY DEFINER).
alter policy orders_client_insert on public.orders
with check (
  client_id = (select auth.uid())
  and status = 'draft'
  and executor_id is null
);

alter policy orders_client_update on public.orders
using (
  client_id = (select auth.uid())
  and status = 'draft'
)
with check (
  client_id = (select auth.uid())
  and status = 'draft'
  and executor_id is null
);
