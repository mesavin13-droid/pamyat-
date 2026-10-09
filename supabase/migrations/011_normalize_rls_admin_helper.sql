-- Normalize every RLS policy to use the private admin helper.
-- pg_policies deparses public-schema function names as bare is_admin(), so match that form too.
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
        coalesce(qual, '') like '%is_admin()%'
        or coalesce(with_check, '') like '%is_admin()%'
      )
  loop
    new_qual := p.qual;
    new_check := p.with_check;

    if new_qual is not null then
      new_qual := replace(new_qual, 'public.is_admin()', '__PUBLIC_ADMIN_SENTINEL__');
      new_qual := replace(new_qual, 'private.is_admin()', '__PRIVATE_ADMIN_SENTINEL__');
      new_qual := replace(new_qual, 'is_admin()', '(select private.is_admin())');
      new_qual := replace(new_qual, '__PUBLIC_ADMIN_SENTINEL__', '(select private.is_admin())');
      new_qual := replace(new_qual, '__PRIVATE_ADMIN_SENTINEL__', '(select private.is_admin())');
    end if;
    if new_check is not null then
      new_check := replace(new_check, 'public.is_admin()', '__PUBLIC_ADMIN_SENTINEL__');
      new_check := replace(new_check, 'private.is_admin()', '__PRIVATE_ADMIN_SENTINEL__');
      new_check := replace(new_check, 'is_admin()', '(select private.is_admin())');
      new_check := replace(new_check, '__PUBLIC_ADMIN_SENTINEL__', '(select private.is_admin())');
      new_check := replace(new_check, '__PRIVATE_ADMIN_SENTINEL__', '(select private.is_admin())');
    end if;

    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_qual is not null then stmt := stmt || format(' using (%s)', new_qual); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end $$;
