# Production security notes

- The browser uses only `NEXT_PUBLIC_SUPABASE_URL` and the publishable key. Server-side secret keys are never committed to Git or exposed through `NEXT_PUBLIC_*`.
- New users are created with the `client` role; admin role assignment is a trusted, manual operation.
- RLS is enabled on all public application tables and the order photos bucket is private.
- The `SECURITY DEFINER` admin helper lives in the `private` schema and is not intended to be exposed through the REST API.
- Trigger-only database functions do not allow direct RPC execution by `anon` or `authenticated`.
- PostgreSQL validates order ownership, amount, care level, selected service, and legal order status transitions.
- Payment creation requires a valid user token and checks that the caller owns the order.
- The YooKassa webhook re-fetches the payment from the provider API, checks RUB currency and the exact order amount, and confirms a matching payment record before changing order status.
- Edge Function secrets stay on the server. Payment creation is not production-ready until YooKassa credentials and the final site URL are configured.

## Before production

1. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the Vercel project's environment variables.
2. Set the exact production URL and magic-link redirect allow-list in Supabase Auth.
3. Configure `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, and `SITE_URL` as Edge Function secrets.
4. Configure the YooKassa webhook to call `/functions/v1/yookassa-webhook`.
5. Test sign-in, client/executor authorization, private photo upload, successful and canceled payments, and repeated webhook delivery before launch.


## Role-based database checks

The project was tested in rolled-back SQL transactions using temporary client and executor identities:

- An anonymous visitor could read the three active cemetery rows and could not read orders.
- An assigned executor could read the assigned memorial and advance the order to the before-photo stage.
- Executor updates to protected order fields and executor cancellation were rejected by the database trigger.
- A client could create a correctly priced draft order; attempts to order for another client's memorial or alter the amount without changing the care tier were rejected.


## Additional hardening — 2026-10-09

- Security-definer trigger functions use an empty `search_path`; trigger/RPC-only functions have direct execution revoked from `public`, `anon`, and `authenticated`.
- An order cannot enter `before_photos` or progress beyond it unless a `before` photo row exists. This is enforced by the database trigger, not only by the UI.
- The live database check confirmed that entering `before_photos` without a photo is rejected and the same transition succeeds after the photo record exists. The test creates temporary users/orders and removes them before returning.
