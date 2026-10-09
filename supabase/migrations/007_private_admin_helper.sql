-- Keep the SECURITY DEFINER admin helper outside PostgREST's exposed public schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') like '%public.is_admin()%'
        or coalesce(with_check, '') like '%public.is_admin()%'
      )
  loop
    new_qual := case when p.qual is null then null
      else replace(p.qual, 'public.is_admin()', 'private.is_admin()') end;
    new_check := case when p.with_check is null then null
      else replace(p.with_check, 'public.is_admin()', 'private.is_admin()') end;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;

revoke execute on function public.is_admin() from public, anon, authenticated;
