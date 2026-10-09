-- Restrict photo uploads to the proper actor and order stage, and use the private admin helper.
drop policy if exists order_photos_storage_read on storage.objects;
create policy order_photos_storage_read on storage.objects
for select using (
  bucket_id = 'order-photos'
  and exists (
    select 1
    from public.orders o
    where o.id::text = (storage.foldername(objects.name))[1]
      and (
        o.client_id = (select auth.uid())
        or o.executor_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
);

drop policy if exists order_photos_storage_insert on storage.objects;
create policy order_photos_storage_insert on storage.objects
for insert with check (
  bucket_id = 'order-photos'
  and exists (
    select 1
    from public.orders o
    where o.id::text = (storage.foldername(objects.name))[1]
      and (
        (select private.is_admin())
        or (
          o.executor_id = (select auth.uid())
          and (
            ((storage.foldername(objects.name))[2] = 'before' and o.status = 'assigned')
            or ((storage.foldername(objects.name))[2] = 'after' and o.status = 'in_progress')
          )
        )
        or (
          o.client_id = (select auth.uid())
          and o.status = 'draft'
          and (storage.foldername(objects.name))[2] = 'assessment'
        )
      )
  )
);

drop policy if exists photos_insert on public.order_photos;
create policy photos_insert on public.order_photos
for insert with check (
  exists (
    select 1
    from public.orders o
    where o.id = order_photos.order_id
      and (
        (select private.is_admin())
        or (
          o.executor_id = (select auth.uid())
          and (
            (order_photos.kind = 'before' and o.status = 'assigned')
            or (order_photos.kind = 'after' and o.status = 'in_progress')
          )
        )
        or (
          o.client_id = (select auth.uid())
          and o.status = 'draft'
          and order_photos.kind = 'assessment'
        )
      )
  )
);

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif']
where id = 'order-photos';
