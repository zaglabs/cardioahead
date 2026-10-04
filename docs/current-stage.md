# Hebrew intake pilot - implementation status

Implemented:
- Removed public demo banners and fixture-only demo screens.
- Hebrew patient access with random 256-bit invitation and separate six-digit PIN.
- Seven-day invitation lifetime, five-attempt lockout, two-hour opaque sessions and revocation.
- Server-only staff email OTP verification with current clinic membership checks.
- Real PDF file upload, persistence, submission and clinic opening/download.
- Private Supabase bucket and tables with deny-by-default browser access.
- Atomic PostgreSQL PIN verification, file attachment and final submission.
- Upload and access audit records; reviewed visit status.
- Three visually checked fictional Hebrew PDFs and enforced fixture hashes.
- Responsive patient/clinic UI, database and two-sided browser tests.

Pending to enable the hosted pilot:
- Supabase project connection, migration, first staff email/user and OTP delivery.
- Vercel environment values; no private backend values currently exist in the project.

Next product step:
- Prof. Maor's anonymized sample report, source-aware extraction and durable AI processing.
- Authenticated report notification, without medical attachments in ordinary email.

Real-patient use remains blocked by the server's fixture whitelist. Individual staff MFA,
approved processing providers/region, quarantine/scanning, patient OTP delivery, retention/deletion,
clinical quality review and a final privacy notice are required before lifting this restriction.
