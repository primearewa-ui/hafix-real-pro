HAFIZ DATA & BILLS — STAGE 3 FOUNDATION

This is a backend integration scaffold, not a certified or fully tested live-commerce system. It includes:
- Supabase SQL schema for profiles, wallet, catalogue, payments, orders, ledger and processed events.
- RLS read policies and server-only database RPCs for wallet debit/refund/deposit idempotency.
- Netlify Functions for authenticated user summary, catalog read, Flutterwave wallet checkout/webhook, and VTPass purchase calls.
- VTPass is configured to sandbox by default.

BEFORE USE
1. Create a Supabase project.
2. Run supabase/schema.sql in the SQL Editor.
3. Create a Git repo and deploy this folder to Netlify (Netlify CLI is also supported).
4. Configure these Netlify environment variables in the function/runtime scope:
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY  (NEVER put this in browser JS or commit it)
   FLW_SECRET_KEY
   FLW_WEBHOOK_SECRET_HASH
   VTPASS_API_KEY
   VTPASS_PUBLIC_KEY
   VTPASS_SECRET_KEY
   VTPASS_BASE_URL=https://sandbox.vtpass.com
   SITE_URL=https://YOUR-SITE.netlify.app
5. Redeploy after changing environment variables.
6. Configure Flutterwave webhook URL to https://YOUR-SITE.netlify.app/api/flutterwave-webhook.
7. Create catalog rows manually from the product/service IDs and variation codes in your VTPass account. Leave active=false until verified. Selling/cost prices are stored in kobo. Do not invent service IDs or variation codes.
8. Enable Supabase email confirmation, configure allowed redirect URLs, and review RLS policies before public signup.
9. Test only with VTPass sandbox and Flutterwave test credentials first.

IMPORTANT IMPLEMENTATION NOTES
- Frontend authentication UI still needs to be wired to Supabase Auth; these functions expect a valid Supabase access token in Authorization: Bearer <token>.
- Catalog is read-only from browser; prices are read from database. Service IDs/variation codes must be checked against your VTPass dashboard/docs.
- VTPass purchase endpoint uses the API-key and secret-key headers per current VTPass docs. GET catalogue calls use API-key and public-key. Request IDs use Africa/Lagos time YYYYMMDDHHII + random suffix.
- VTPass code 000 alone does not prove delivery: this scaffold marks success only when content.transactions.status is delivered. Only documented terminal failure codes 016 and 091 trigger an automatic refund; ambiguous codes remain review and require /api/requery. Validate response handling per service in sandbox.
- Provider/network timeouts are ambiguous. Never auto-refund an uncertain order until requery confirms failure. Use VTPass /api/requery with request_id for reconciliation.
- Before production: add a scheduled reconciliation job, rate limits, abuse controls, admin role management, secure account verification, monitoring/alerts, legal pages, backups, and end-to-end tests.
- Direct purchase via Flutterwave is not yet implemented; wallet checkout is implemented at foundation level. Build a separate direct checkout/order-payment workflow before advertising direct purchase as available.
- A real wallet deposit webhook credits only when a matching pending payment record exists and the verified amount/reference/currency match. Test duplicate webhook delivery and mismatch scenarios.
- Never expose SUPABASE_SERVICE_ROLE_KEY, VTPASS_SECRET_KEY, FLW_SECRET_KEY in the frontend.
