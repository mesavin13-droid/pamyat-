# Production security notes

- The client never receives a Supabase secret key.
- create-yookassa-payment validates the authenticated user before reading the order.
- The order amount is checked in PostgreSQL against care_pricing.
- Active duplicate payment attempts are prevented by a partial unique index.
- The YooKassa webhook retrieves the payment from YooKassa before updating the order.
- Order photos are stored in a private Storage bucket.
- Production role selection is taken from profiles.role; role switching is demo-only.
- Payment provider and Supabase secrets belong in platform or Edge Function secrets, never in Git.

Before production:
1. Apply the complete schema and migrations to the dedicated ПАМЯТЬ Supabase project.
2. Configure YooKassa secrets.
3. Configure the YooKassa webhook URL.
4. Test successful, canceled and repeated payment attempts.
5. Verify Storage policies using real client and executor accounts.