-- Hardening migration for order pricing, ownership and required proof photos.
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

drop policy if exists orders_client_insert on public.orders;
create policy orders_client_insert on public.orders for insert with check(client_id=auth.uid() and status='draft' and executor_id is null and exists(select 1 from public.memorials m where m.id=memorial_id and m.client_id=auth.uid()));
drop policy if exists orders_client_update on public.orders;
create policy orders_client_update on public.orders for update using(client_id=auth.uid() and status='draft') with check(client_id=auth.uid() and status='draft' and executor_id is null and exists(select 1 from public.memorials m where m.id=memorial_id and m.client_id=auth.uid()));

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

