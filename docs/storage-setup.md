# Private upload pilot setup

The screens now use real invitations and file uploads. The hosted flow remains closed until
a dedicated Supabase project is connected. Only the three reviewed synthetic PDFs are accepted,
verified by their SHA-256 hashes on the server. This restriction cannot be disabled by a browser flag.

## Supabase

1. Create a dedicated CardioAhead project. Choose the storage region with the clinic before
   any real patient records are used. This stage is for synthetic data only.
2. Run `supabase/migrations/202610040001_portal.sql` in the project's SQL editor.
   It creates private tables, a private storage bucket and atomic PIN/upload/submission functions.
3. Turn off public email signups. Create each clinic staff user in Auth > Users.
4. Insert a membership with the matching Auth user ID and lower-case email:
   `insert into public.clinic_staff(id,email,role) values ('AUTH-USER-UUID','staff@example.com','admin');`
   Valid roles: admin, secretary, professor. These roles currently share one clinic's document access.
5. Configure SMTP for email delivery. Set the Magic Link email template to contain
   `{{ .Token }}` so staff can type the emailed OTP into the Hebrew login screen.
   Supabase's default sender is restricted and should not be assumed to work for arbitrary staff emails.
6. Set the site URL to https://www.cardioahead.com.
7. Add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and
   CARDIOAHEAD_SESSION_SECRET to Vercel's production environment and redeploy.
   The secret must contain at least 32 characters. Service keys remain server-only.

Database tables and the storage bucket intentionally have no browser/anon/authenticated access.
Every application route verifies a server-held clinic membership or scoped patient session first.
Never add broad public policies to make an authorization failure disappear.

## Test workflow

- Sign in at /admin with the registered staff email and emailed OTP.
- Create an appointment with a fictional label; copy the invitation and PIN immediately.
- Open the link in a different browser or private window. Supply the six-digit PIN.
- Download PDFs from /test-documents, then select and upload two or three of them.
- Check the saved list, confirm, and submit. The clinic inbox refreshes every 30 seconds
  and can also be refreshed manually.
- In the appointment, open/download the PDFs and mark the case reviewed.
- Test wrong PINs (five failures lock the invitation), cancellation, logout, repeated
  uploads and cross-patient access. Each invitation lasts seven days; sessions last two hours.

No AI report or email notification is claimed to exist at this stage.

## Local verification

The Playwright suite opts into a filesystem backend under a test-specific temporary directory.
This uses the same server routes and real PDF bytes without requiring cloud credentials.
It is unavailable whenever VERCEL is present, regardless of any local flag.
The local clinic identity and password exist only for automated tests, never hosted access.

## Before real patient records

Approve provider/region and privacy notice, enable individual staff MFA, add malware quarantine
and scanning, patient identity verification through a trusted contact/OTP supplier, clinical
retention/deletion and backup procedures, durable extraction jobs and Prof. Maor's report template.
Replace the synthetic PDF whitelist only after those controls and isolation tests are complete.
