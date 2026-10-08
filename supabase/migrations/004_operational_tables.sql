create unique index if not exists payments_one_active_per_order on public.payments(order_id) where status in ('pending','waiting_for_capture');

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