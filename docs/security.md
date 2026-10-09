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
