-- Fix the executor read predicate: compare the order's memorial_id with the outer memorial row id.
-- The previous unqualified "id" resolved to orders.id instead of memorials.id.
alter policy memorials_client on public.memorials
using (
  client_id = (select auth.uid())
  or (select private.is_admin())
  or exists (
    select 1
    from public.orders o
    where o.memorial_id = memorials.id
      and o.executor_id = (select auth.uid())
  )
)
with check (
  client_id = (select auth.uid())
  or (select private.is_admin())
);
