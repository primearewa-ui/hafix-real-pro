HAFIZ DATA & BILLS — Stage 4 preview pack

WHAT'S NEW
- login.html: email/password sign-up and sign-in screen using Supabase Auth once configured.
- WhatsApp support buttons point to https://wa.me/2349120241895.
- website live-chat visual preview (local browser only; not sent to an admin yet).
- admin.html visual preview for planned admin features (not a secure functioning admin backend).
- support conversations/messages schema added to supabase/schema.sql.

IMPORTANT HONEST STATUS
This is a preview/testing foundation, not a production-ready bills website. The account page can connect to Supabase Auth after configuration. Wallet, payment verification, provider fulfilment, real admin tools, shared live chat, and secure agent permissions are not fully implemented by this pack. Do not accept customer money or expose real customer data until those backend pieces are built and tested.

HOW TO UPLOAD TO GITHUB/NETLIFY
1. Extract this ZIP on your phone/computer.
2. Upload/replace the files in your existing GitHub repository, preserving folders (especially netlify/functions and supabase).
3. Netlify will redeploy from GitHub. Check the deploy succeeds.

SUPABASE SETUP (needed for real accounts and database-backed features)
1. Go to https://supabase.com/ and create a project. Save the database password privately.
2. Open the project -> SQL Editor -> New query. Open supabase/schema.sql from this ZIP, copy all contents, paste into SQL Editor and press Run. Do not run it against a production database with existing customer data without a backup/review.
3. Open Project Settings -> API (or Data API / API Keys). Copy Project URL and anon/publishable key. These are client values; never share the service_role/secret key.
4. Copy config.example.js to config.js and replace the two placeholder values. Upload config.js to the GitHub root.
5. In Supabase Authentication settings, configure the site URL to your Netlify .netlify.app address and allowed redirect URLs.
6. Visit /login.html to test signup/login. For a real site, keep email confirmation enabled and set up email delivery.

WHATSAPP
Number configured: +234 912 024 1895. The button opens WhatsApp; it does not automatically import WhatsApp messages into the website inbox.

SECRETS
Never paste passwords, Flutterwave secret keys, VTPass credentials, or Supabase service_role keys into chat or browser files. Store backend secrets in Netlify Site configuration -> Environment variables.
