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
declare expected integer; expected_service uuid;
begin
  if new.care_level is not null then
    select price_rub,service_id into expected,expected_service from public.care_pricing where code=new.care_level and active=true;
    if expected is null or new.amount_rub<>expected then raise exception 'Invalid care price'; end if;
    if new.service_id is null then new.service_id=expected_service; end if;
    if expected_service is not null and new.service_id<>expected_service then raise exception 'Invalid service for care level'; end if;
  elsif new.service_id is not null then
    select price_rub into expected from public.services where id=new.service_id and active=true;
    if expected is null or new.amount_rub<>expected then raise exception 'Invalid service price'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_validate_price on public.orders;
create trigger orders_validate_price before insert or update of care_level,service_id,amount_rub on public.orders for each row execute function public.validate_order_price();

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
create policy orders_client_insert on public.orders for insert with check(client_id=auth.uid() and status='draft' and executor_id is null);
drop policy if exists orders_client_update on public.orders;
create policy orders_client_update on public.orders for update using(client_id=auth.uid() and status='draft') with check(client_id=auth.uid() and status='draft');
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
