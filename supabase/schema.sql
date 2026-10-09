create extension if not exists pgcrypto;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'client' check(role in ('client','executor','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.cemeteries(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services(
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  price_rub integer not null check(price_rub>0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.care_pricing(
  code text primary key check(code in ('regular','three_to_six_months','six_to_twelve_months','over_year','unknown')),
  title text not null,
  price_rub integer not null check(price_rub>0),
  service_id uuid references public.services(id),
  active boolean not null default true
);

create table if not exists public.memorials(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  cemetery_id uuid not null references public.cemeteries(id),
  name text not null,
  sector text not null default '',
  row text not null default '',
  place text not null default '',
  care_level text check(care_level in ('regular','three_to_six_months','six_to_twelve_months','over_year','unknown')),
  last_care_at timestamptz,
  next_recommended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  memorial_id uuid not null references public.memorials(id),
  service_id uuid references public.services(id),
  executor_id uuid references public.profiles(id),
  care_level text check(care_level in ('regular','three_to_six_months','six_to_twelve_months','over_year','unknown')),
  amount_rub integer not null check(amount_rub>0),
  visit_date date,
  status text not null default 'draft' check(status in ('draft','awaiting_payment','paid','assigned','before_photos','in_progress','after_photos','review','completed','cancelled')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_photos(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check(kind in ('assessment','before','after')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.visits(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  started_at timestamptz,
  completed_at timestamptz,
  executor_note text
);

create table if not exists public.subscriptions(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  memorial_id uuid not null references public.memorials(id) on delete cascade,
  plan_code text not null,
  next_visit_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text unique,
  idempotency_key text not null unique,
  amount_rub integer not null check(amount_rub>0),
  status text not null default 'pending' check(status in ('pending','waiting_for_capture','succeeded','canceled')),
  confirmation_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cemeteries(name) values
('Клещихинское кладбище'),('Заельцовское кладбище'),('Гусинобродское кладбище')
on conflict(name) do nothing;

insert into public.services(name,description,price_rub) values
('Лёгкий уход','Для мест, за которыми ухаживают регулярно.',2990),
('Полный уход','Для ухода раз в несколько месяцев.',4290),
('Тщательный уход','Для места, которому не уделяли внимание 6–12 месяцев.',5990),
('Глубокий уход','Для давно запущенного места.',7900),
('Забота+','Полный уход, цветы, короткое видео и рекомендации.',6490),
('Сезонная забота','4 выезда в течение сезона с фотоотчётом после каждого.',15900)
on conflict(name) do update set description=excluded.description, price_rub=excluded.price_rub;

insert into public.care_pricing(code,title,price_rub,service_id) values
('regular','Ухаживаем регулярно',2990,(select id from public.services where name='Лёгкий уход')),
('three_to_six_months','3–6 месяцев назад',4290,(select id from public.services where name='Полный уход')),
('six_to_twelve_months','6–12 месяцев назад',5990,(select id from public.services where name='Тщательный уход')),
('over_year','Больше года назад',7900,(select id from public.services where name='Глубокий уход')),
('unknown','Не знаю',4290,(select id from public.services where name='Полный уход'))
on conflict(code) do update set title=excluded.title,price_rub=excluded.price_rub,service_id=excluded.service_id,active=true;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

drop trigger if exists memorials_touch on public.memorials;
create trigger memorials_touch before update on public.memorials for each row execute function public.touch_updated_at();
drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.validate_order_price() returns trigger
language plpgsql security definer set search_path=public
as $$
declare expected integer; expected_service uuid; memorial_owner uuid;
begin
  select client_id into memorial_owner from public.memorials where id=new.memorial_id;
  if memorial_owner is null or memorial_owner<>new.client_id then
    raise exception 'Order memorial does not belong to the client';
  end if;

  if new.care_level is not null then
    select price_rub,service_id into expected,expected_service from public.care_pricing where code=new.care_level and active=true;
    if expected is null or new.amount_rub<>expected then raise exception 'Invalid care price'; end if;
    if expected_service is null then raise exception 'Care price has no active base service'; end if;
    if new.service_id is null then new.service_id=expected_service; end if;
    if new.service_id<>expected_service then raise exception 'Invalid service for care level'; end if;
  elsif new.service_id is not null then
    select price_rub into expected from public.services where id=new.service_id and active=true;
    if expected is null or new.amount_rub<>expected then raise exception 'Invalid service price'; end if;
  else
    raise exception 'Order requires a valid care level or service';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_validate_price on public.orders;
create trigger orders_validate_price before insert or update of client_id,memorial_id,care_level,service_id,amount_rub on public.orders for each row execute function public.validate_order_price();

create or replace function public.sync_memorial_after_completion() returns trigger
language plpgsql security definer set search_path=public
as $$
declare days integer;
begin
 if new.status='completed' and old.status is distinct from new.status and new.visit_date is not null and new.care_level is not null then
  days:=case new.care_level when 'regular' then 90 when 'three_to_six_months' then 90 when 'six_to_twelve_months' then 60 when 'over_year' then 45 else 75 end;
  update public.memorials set care_level=new.care_level,last_care_at=new.visit_date::timestamptz,next_recommended_at=new.visit_date+days where id=new.memorial_id;
 end if;
 return new;
end;
$$;
drop trigger if exists orders_sync_memorial on public.orders;
create trigger orders_sync_memorial after update of status on public.orders for each row execute function public.sync_memorial_after_completion();

alter table public.profiles enable row level security;
alter table public.cemeteries enable row level security;
alter table public.services enable row level security;
alter table public.care_pricing enable row level security;
alter table public.memorials enable row level security;
alter table public.orders enable row level security;
alter table public.order_photos enable row level security;
alter table public.visits enable row level security;
alter table public.subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.payments enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select using(id=auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists cemeteries_read on public.cemeteries;
create policy cemeteries_read on public.cemeteries for select using(active=true or public.is_admin());
drop policy if exists services_read on public.services;
create policy services_read on public.services for select using(active=true or public.is_admin());
drop policy if exists care_pricing_read on public.care_pricing;
create policy care_pricing_read on public.care_pricing for select using(active=true or public.is_admin());
drop policy if exists care_pricing_admin on public.care_pricing;
create policy care_pricing_admin on public.care_pricing for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists memorials_client on public.memorials;
create policy memorials_client on public.memorials for all using(client_id=auth.uid() or public.is_admin() or exists(select 1 from public.orders o where o.memorial_id=id and o.executor_id=auth.uid())) with check(client_id=auth.uid() or public.is_admin());
drop policy if exists orders_related on public.orders;
create policy orders_related on public.orders for select using(client_id=auth.uid() or executor_id=auth.uid() or public.is_admin());
drop policy if exists orders_client_insert on public.orders;
create policy orders_client_insert on public.orders for insert with check(client_id=auth.uid() and status='draft' and executor_id is null and exists(select 1 from public.memorials m where m.id=memorial_id and m.client_id=auth.uid()));
drop policy if exists orders_client_update on public.orders;
create policy orders_client_update on public.orders for update using(client_id=auth.uid() and status='draft') with check(client_id=auth.uid() and status='draft' and executor_id is null and exists(select 1 from public.memorials m where m.id=memorial_id and m.client_id=auth.uid()));
drop policy if exists orders_executor_update on public.orders;
create policy orders_executor_update on public.orders for update using(executor_id=auth.uid() or public.is_admin()) with check(executor_id=auth.uid() or public.is_admin());
drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists photos_related on public.order_photos;
create policy photos_related on public.order_photos for select using(exists(select 1 from public.orders o where o.id=order_id and (o.client_id=auth.uid() or o.executor_id=auth.uid() or public.is_admin())));
drop policy if exists photos_insert on public.order_photos;
create policy photos_insert on public.order_photos for insert with check(exists(select 1 from public.orders o where o.id=order_id and (o.executor_id=auth.uid() or public.is_admin() or (o.client_id=auth.uid() and o.status='draft' and kind='assessment'))));
drop policy if exists visits_related on public.visits;
create policy visits_related on public.visits for select using(exists(select 1 from public.orders o where o.id=order_id and (o.client_id=auth.uid() or o.executor_id=auth.uid() or public.is_admin())));
drop policy if exists visits_write on public.visits;
create policy visits_write on public.visits for all using(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid()));
drop policy if exists subscriptions_related on public.subscriptions;
create policy subscriptions_related on public.subscriptions for select using(client_id=auth.uid() or public.is_admin());
drop policy if exists subscriptions_admin on public.subscriptions;
create policy subscriptions_admin on public.subscriptions for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications for all using(profile_id=auth.uid() or public.is_admin()) with check(profile_id=auth.uid() or public.is_admin());
drop policy if exists payments_related on public.payments;
create policy payments_related on public.payments for select using(exists(select 1 from public.orders o where o.id=order_id and (o.client_id=auth.uid() or public.is_admin())));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public
as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)) on conflict(id) do nothing; return new; end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into storage.buckets(id,name,public) values('order-photos','order-photos',false) on conflict(id) do update set public=false;

drop policy if exists order_photos_storage_read on storage.objects;
create policy order_photos_storage_read on storage.objects for select using(bucket_id='order-photos' and exists(select 1 from public.orders o where o.id::text=(storage.foldername(name))[1] and (o.client_id=auth.uid() or o.executor_id=auth.uid() or public.is_admin())));
drop policy if exists order_photos_storage_insert on storage.objects;
create policy order_photos_storage_insert on storage.objects for insert with check(bucket_id='order-photos' and exists(select 1 from public.orders o where o.id::text=(storage.foldername(name))[1] and (o.executor_id=auth.uid() or public.is_admin() or (o.client_id=auth.uid() and o.status='draft' and (storage.foldername(name))[2]='assessment'))));


-- Prevent duplicate active payment attempts for the same order.
create unique index if not exists payments_one_active_per_order
on public.payments(order_id)
where status in ('pending','waiting_for_capture');

create table if not exists public.service_addons(
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null default '',
  price_rub integer not null check(price_rub>0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_type text not null check(item_type in ('base','addon')),
  code text not null,
  title text not null,
  qty integer not null default 1 check(qty>0),
  unit_price_rub integer not null check(unit_price_rub>0),
  total_rub integer generated always as (qty * unit_price_rub) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.order_assessments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  condition_level text not null check(condition_level in ('regular','three_to_six_months','six_to_twelve_months','over_year','unknown')),
  estimated_minutes integer,
  notes text,
  assessed_by uuid references public.profiles(id),
  client_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_addons enable row level security;
alter table public.order_items enable row level security;
alter table public.order_assessments enable row level security;

drop policy if exists service_addons_read on public.service_addons;
create policy service_addons_read on public.service_addons for select using(active=true or public.is_admin());
drop policy if exists service_addons_admin on public.service_addons;
create policy service_addons_admin on public.service_addons for all using(public.is_admin()) with check(public.is_admin());
drop policy if exists order_items_related on public.order_items;
create policy order_items_related on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id and (o.client_id=auth.uid() or o.executor_id=auth.uid() or public.is_admin())));
drop policy if exists order_items_write on public.order_items;
create policy order_items_write on public.order_items for all using(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid()));
drop policy if exists order_assessments_related on public.order_assessments;
create policy order_assessments_related on public.order_assessments for select using(exists(select 1 from public.orders o where o.id=order_id and (o.client_id=auth.uid() or o.executor_id=auth.uid() or public.is_admin())));
drop policy if exists order_assessments_write on public.order_assessments;
create policy order_assessments_write on public.order_assessments for all using(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid())) with check(public.is_admin() or exists(select 1 from public.orders o where o.id=order_id and o.executor_id=auth.uid()));

drop trigger if exists order_assessments_touch on public.order_assessments;
create trigger order_assessments_touch before update on public.order_assessments for each row execute function public.touch_updated_at();


-- Enforce the order lifecycle and required evidence photos at database level.
create or replace function public.validate_order_transition() returns trigger
language plpgsql security definer set search_path=public
as $$
declare has_before boolean; has_after boolean;
begin
  if tg_op='INSERT' then
    if new.status<>'draft' then raise exception 'New orders must start in draft'; end if;
    return new;
  end if;
  if new.status is not distinct from old.status then return new; end if;

  if new.status='cancelled' then
    if old.status='completed' then raise exception 'Completed orders cannot be cancelled'; end if;
    return new;
  end if;

  if not (
    (old.status='draft' and new.status in ('awaiting_payment','paid')) or
    (old.status='awaiting_payment' and new.status='paid') or
    (old.status='paid' and new.status='assigned') or
    (old.status='assigned' and new.status='before_photos') or
    (old.status='before_photos' and new.status='in_progress') or
    (old.status='in_progress' and new.status='review') or
    (old.status='review' and new.status='completed') or
    (old.status=new.status)
  ) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;

  if new.status in ('in_progress','review','completed') then
    select exists(select 1 from public.order_photos where order_id=new.id and kind='before') into has_before;
    if not has_before then raise exception 'Photo before work is required'; end if;
  end if;
  if new.status in ('review','completed') then
    select exists(select 1 from public.order_photos where order_id=new.id and kind='after') into has_after;
    if not has_after then raise exception 'Photo after work is required'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_validate_transition on public.orders;
create trigger orders_validate_transition before insert or update of status on public.orders
for each row execute function public.validate_order_transition();



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


-- Keep the SECURITY DEFINER admin helper outside PostgREST's exposed public schema.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
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


-- Trigger-only functions should not be callable as RPC functions.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- The helper uses fully-qualified table/function names, so an empty search path is safest.
alter function private.is_admin() set search_path = '';
