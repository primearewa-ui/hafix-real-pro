HAFIZ DATA & BILLS — COMPLETE INTEGRATION STARTER (STAGE 5)
===========================================================

This package is a deployable integration foundation, not a claim that live payments/services have already passed end-to-end testing. The customer dashboard still marks sample purchases as demo-only. Do NOT accept real customer money or promise real service delivery until every item in the checklist passes.

INCLUDED
--------
- Responsive customer website with dark/light theme switch and PWA assets.
- Supabase email/password sign-up/sign-in page.
- Supabase schema for profiles, wallets, catalog, payments, orders, ledger, event idempotency, support conversations/messages and RLS.
- Netlify Functions for catalog, payment creation, VTPass order foundation, Flutterwave webhook foundation, auth-check and persistent support chat API.
- Admin/support inbox with server-checked admin/agent role for reading/replying/resolving chat.
- WhatsApp support link: https://wa.me/2349120241895
- .env.example, config.example.js and deployment/testing checklist.

STEP 1 — SUPABASE
-----------------
1. Create a Supabase project at https://supabase.com/.
2. Open SQL Editor -> New query.
3. Open supabase/schema.sql from this ZIP, copy the entire file, paste into SQL Editor, and Run.
4. In Authentication -> URL Configuration, set Site URL to your Netlify URL and add redirect URLs for https://YOUR-SITE.netlify.app/** and your local Netlify dev URL if used.
5. In Authentication settings, decide whether email confirmation is enabled. Configure SMTP before production if using custom email delivery.
6. Create your account at /login.html and verify the email if required.
7. In Supabase Authentication -> Users, copy the UUID for YOUR OWN account. In SQL Editor run this, replacing the UUID with yours:
   update public.profiles set role='admin' where id='YOUR-USER-UUID';
   Verify the UUID carefully. Do not promote anyone else's account. Never put the service-role key in browser code.

STEP 2 — PUBLIC FRONTEND CONFIG
-------------------------------
1. Copy config.example.js to config.js in the website root.
2. In Supabase Project Settings -> API, copy Project URL and the public anon/publishable key into config.js.
3. These two values are public frontend configuration. NEVER use a service_role/secret key here.
4. config.js is ignored by Git through .gitignore. For a simple static Netlify deploy, create config.js locally and upload it to your repository root as a separate file (or use your build pipeline to generate it). Do not commit secrets. Because it contains only the public key it is not a secret, but avoid committing personal configuration if desired.

STEP 3 — NETLIFY
----------------
1. Push the contents of this folder (not the parent folder) to the root of your GitHub repository.
2. In Netlify import the repository. Publish directory is '.' and functions directory is netlify/functions (netlify.toml configures these).
3. Netlify Site configuration -> Environment variables: configure SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Service-role key belongs ONLY in Netlify server environment variables.
4. Redeploy after setting variables. Test login and support chat over the deployed HTTPS site.
5. Local test: install Node.js, run npm install, then npm run dev. Netlify CLI starts the local site.

STEP 4 — VTPASS AND FLUTTERWAVE (SANDBOX FIRST)
-----------------------------------------------
- Obtain authorized VTPass API credentials and use its sandbox/base URL first. Set VT_PASS_API_KEY, VT_PASS_PUBLIC_KEY, VT_PASS_SECRET_KEY and VT_PASS_BASE_URL in Netlify environment variables only. Verify current official docs and exact product payload/variation requirements for each service before enabling it.
- Obtain Flutterwave credentials, use test keys first, and set FLW_SECRET_KEY and FLW_SECRET_HASH in Netlify environment variables. Configure the webhook URL to https://YOUR-SITE.netlify.app/.netlify/functions/flutterwave-webhook and set the matching secret hash. Test webhook signature verification and idempotency.
- Never place provider secrets in HTML, app.js, config.js, GitHub, screenshots or chat messages.
- The current customer purchase UI is still demo-only and must not be presented as live fulfilment. Payment creation and provider functions need end-to-end testing, VTPass status requery/reconciliation, exact product mappings, verified payment/webhook behavior and operational error handling before activation.

SUPPORT CHAT
------------
- Customers must sign in; messages are sent to /.netlify/functions/support-chat.
- Admin/agent access checks the profile role server-side. New profiles default to customer.
- The owner role must be set using the SQL instruction above. Never trust a role supplied by a browser.
- The current admin inbox covers viewing/replying/resolving support conversations. It is not yet a complete customer-management, price-editing, wallet-adjustment, reports or agent-provisioning dashboard. Those high-risk operations need their own server-side authorization, audit records and tests before being added.
- WhatsApp button opens the WhatsApp app/site; it does not automatically import WhatsApp messages into the website inbox. That needs WhatsApp Business Platform approval/API/webhook setup.

BEFORE REAL LAUNCH — REQUIRED CHECKLIST
--------------------------------------
[ ] Confirm signup, email verification, login, logout, password reset and session expiry.
[ ] Confirm customer cannot access /admin inbox; admin/agent can.
[ ] Confirm RLS prevents users reading other customers' profiles, wallets, orders, payments, ledger or support messages.
[ ] Test chat send/reply/resolution from two separate accounts and on mobile.
[ ] Test catalog/product mapping against official provider docs and current prices.
[ ] Test VTPass sandbox success, failed, pending, timeout and requery paths. Never assume a timeout means failure.
[ ] Test Flutterwave test deposits, bad signature, duplicate webhook, amount/currency/user mismatch and webhook retry behavior.
[ ] Implement and test atomic wallet credit/debit and purchase reserve/refund, idempotency and audit log before real transactions.
[ ] Add rate limiting, abuse protection, monitoring, backup/restore and privacy/terms/refund pages.
[ ] Have an independent security review before handling customer funds.

KNOWN LIMITATIONS
-----------------
- Dashboard purchases/funding remain demo-only; no live purchase should be attempted from the customer UI.
- Flutterwave webhook and VTPass code are integration foundations; review and harden before production, including retry-safe event processing and provider status reconciliation.
- Owner/admin price editing, customer administration, wallet manual adjustments, reporting and support-agent creation are not yet implemented as operational features.
- Email delivery and provider account approvals/credentials are your responsibility.
- No provider credentials are included in this ZIP.
