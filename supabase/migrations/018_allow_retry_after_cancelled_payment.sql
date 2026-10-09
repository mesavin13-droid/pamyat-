-- Permit another payment attempt only when the previous YooKassa attempt was confirmed canceled.
-- The order remains protected: a cancelled order without a canceled payment row cannot be reopened.
create or replace function public.validate_order_transition() returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  has_before boolean;
  has_after boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New orders must start in draft';
    end if;
    return new;
  end if;

  if auth.uid() is not null
     and auth.uid() = old.executor_id
     and not private.is_admin() then
    if new.id is distinct from old.id
      or new.client_id is distinct from old.client_id
      or new.memorial_id is distinct from old.memorial_id
      or new.service_id is distinct from old.service_id
      or new.executor_id is distinct from old.executor_id
      or new.care_level is distinct from old.care_level
      or new.amount_rub is distinct from old.amount_rub
      or new.visit_date is distinct from old.visit_date
      or new.comment is distinct from old.comment
      or new.created_at is distinct from old.created_at then
      raise exception 'Executors may only update order status';
    end if;

    if new.status is distinct from old.status
      and not (
        (old.status = 'assigned' and new.status = 'before_photos')
        or (old.status = 'before_photos' and new.status = 'in_progress')
        or (old.status = 'in_progress' and new.status = 'review')
      ) then
      raise exception 'Executors may only advance assigned work stages';
    end if;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'cancelled' then
    if old.status = 'completed' then
      raise exception 'Completed orders cannot be cancelled';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'draft' and new.status in ('awaiting_payment', 'paid'))
    or (old.status = 'awaiting_payment' and new.status = 'paid')
    or (old.status = 'paid' and new.status = 'assigned')
    or (old.status = 'assigned' and new.status = 'before_photos')
    or (old.status = 'before_photos' and new.status = 'in_progress')
    or (old.status = 'in_progress' and new.status = 'review')
    or (old.status = 'review' and new.status = 'completed')
    or (
      old.status = 'cancelled'
      and new.status = 'awaiting_payment'
      and exists (
        select 1 from public.payments p
        where p.order_id = old.id and p.status = 'canceled'
      )
    )
    or old.status = new.status
  ) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;

  if new.status in ('before_photos', 'in_progress', 'review', 'completed') then
    select exists (
      select 1 from public.order_photos
      where order_id = new.id and kind = 'before'
    ) into has_before;
    if not has_before then
      raise exception 'Photo before work is required';
    end if;
  end if;

  if new.status in ('review', 'completed') then
    select exists (
      select 1 from public.order_photos
      where order_id = new.id and kind = 'after'
    ) into has_after;
    if not has_after then
      raise exception 'Photo after work is required';
    end if;
  end if;

  return new;
end;
$function$;
