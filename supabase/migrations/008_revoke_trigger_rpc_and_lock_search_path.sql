-- Trigger-only functions should not be callable as RPC functions.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- The helper uses fully-qualified table/function names, so an empty search path is safest.
alter function private.is_admin() set search_path = '';
