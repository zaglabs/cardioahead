# Private storage and direct Resend login setup

The hosted flow remains closed until its server-only credentials are configured.
Only the three reviewed synthetic PDFs are accepted, verified by server-side SHA-256 hashes.

## Supabase

Create a dedicated CardioAhead project. Run these migrations in order in its SQL editor:

1. `supabase/migrations/202610040001_portal.sql`
2. `supabase/migrations/202610040002_staff_otp.sql`

The second migration removes the Supabase Auth dependency, invalidates previous staff sessions
and requires previous staff to be approved again. It seeds **galadv73@gmail.com** as the only
active administrator. Database constraints and a trigger protect this account.
Do not create staff in Supabase Auth. No Auth SMTP or Magic Link template is needed.

RLS and denied browser grants cover all private tables, including OTP challenges.
Only server-side service-role operations can call the authentication functions.
The storage bucket is private; there are no public document URLs or browser storage policies.

## Resend

Verify a sending domain in Resend, for example `cardioahead.com` or a dedicated subdomain.
Add exactly the DNS records Resend shows, keeping the existing website DNS records.
Create a sending API key, restricted to that domain where available.
Set `RESEND_FROM_EMAIL` to `CardioAhead <login@cardioahead.com>` or another verified sender.
No mailbox is required just to send from this address.

The server calls [Resend's raw Send Email API](https://resend.com/docs/api-reference/emails/send-email)
with fetch, Bearer authentication and an idempotency key.
No SDK, webhook, Supabase SMTP or hosted authentication redirect is used.
Emails contain only a login code and instructions, with no medical information or attachments.

## Vercel production variables

When connected through Vercel Marketplace, SUPABASE_URL and SUPABASE_SECRET_KEY are synchronized automatically. The app prefers the modern secret key and also supports SUPABASE_SERVICE_ROLE_KEY for legacy installations. Leave the integration-managed values unchanged.

Add these in the project Settings > Environment Variables for Production:

| Name | Value |
| --- | --- |
| NEXT_PUBLIC_SITE_URL | https://www.cardioahead.com |
| SUPABASE_URL | The Supabase project HTTPS URL |
| SUPABASE_SECRET_KEY | The server-side secret key (automatically added by the integration) |
| CARDIOAHEAD_SESSION_SECRET | A cryptographically random secret of at least 32 characters |
| RESEND_API_KEY | The Resend sending API key |
| RESEND_FROM_EMAIL | CardioAhead <login@cardioahead.com>, or your verified sender |

Generate a secret locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
Enter secrets directly in Vercel; never commit them or paste them into chat.
Redeploy after setting variables. The application no longer uses a Supabase anon key.

## Owner and staff

1. At `/admin`, enter **galadv73@gmail.com** and verify the emailed six-digit code.
2. Your small **ניהול משתמשים** button opens `/admin/users`.
3. Each staff member verifies their own email at `/admin`. They see a waiting-for-approval screen.
4. You select secretary or doctor/professor and approve them in user management.
5. Staff check approval status or sign in again to enter the clinic.
6. Suspension or rejection invalidates their sessions immediately. Existing records stay intact.

Both staff roles currently share the single clinic's visit and document access.
Only the owner manages users. A second administrator cannot be granted.

## Authentication safeguards

- Random six-digit numeric OTP including leading zeros, valid for ten minutes and one use.
- Five incorrect attempts lock a challenge.
- The requesting browser holds an HttpOnly challenge cookie.
- Only HMAC code digests are stored, with the secret remaining server-side.
- Database-atomic limits: one request per email per minute, five per email per hour,
  and thirty per IP per hour. The Vercel platform IP header is hashed before storage.
- Old challenge rows are removed after one hour on subsequent requests.
- Two-hour opaque sessions stored as hashes; Secure, HttpOnly, SameSite=Strict cookies.
- Same-origin mutations and backend membership checks on protected requests.
- Resend API success means email acceptance, not proof of inbox delivery.

## Upload test

Create a fictional appointment, copy its personal link and separate patient PIN, then open it
in another browser. Upload two PDFs from `/test-documents`, confirm and submit.
Refresh the clinic inbox, open the documents and mark the case reviewed.
No AI report or report email notification exists yet.

## Local tests

Playwright starts a loopback mock of the raw Resend API and private filesystem storage.
Tests read actual random codes from the mock mailbox and exercise the regular authentication
endpoints. There is no fixed OTP or password bypass.
Local storage and the mock endpoint are disabled whenever VERCEL is present.

## Real patient records

The synthetic PDF restriction remains. Real-data launch needs the clinic's provider, region
and data-handling decisions, identity verification, scanning, retention and backup procedures,
clinical report validation and the professor's report template.
