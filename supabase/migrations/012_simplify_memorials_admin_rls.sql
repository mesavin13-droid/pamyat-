-- Keep the memorial policy readable and prevent nested scalar SELECTs around the private admin helper.
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
