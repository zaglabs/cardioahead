# Hebrew clinic portal - implementation status

Implemented:
- Hebrew invitations, separate patient PINs, uploads and private clinic PDF access.
- Sole protected administrator: galadv73@gmail.com.
- Six-digit email OTP through the raw Resend API, without SDK, webhooks or Supabase Auth.
- Durable hashed OTPs, ten-minute expiry, single use, five-attempt lockout and atomic rate limits.
- Browser-bound challenges and two-hour opaque authenticated sessions.
- Email-verified staff requests, owner approval, secretary/doctor roles and session-revoking suspension.
- Small owner-only management button and responsive Hebrew staff management.
- Private Supabase bucket and tables, denied browser access and database authorization.
- PostgreSQL tests and desktop/mobile two-browser flow tests.
- Three visibly fictional Hebrew PDFs and a server-enforced hash whitelist.

Pending to enable hosted login:
- Supabase project connection and both SQL migrations.
- Verified Resend sending domain and sending API key.
- Server-only Vercel environment variables and redeployment.

Next:
- Prof. Maor's anonymized report sample, document extraction and durable AI processing.
- Authenticated report notifications without medical email attachments.

Real-patient use remains blocked by the synthetic PDF whitelist.
