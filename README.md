# CardioAhead

Hebrew and English pre-appointment preparation for Prof. Elad Maor, hosted on Vercel.

## Current release

The demo screens have been replaced with a working **synthetic-data intake pilot**:
clinic staff sign-in, real appointment invitations, six-digit access codes, PDF uploads,
submission tracking, private clinic document access, and reviewed status.

Only the three visibly fictional PDFs in `public/test-documents/` are accepted.
The server checks their SHA-256 hashes against `src/lib/test-documents.json`.
This intentionally prevents use of the test pilot for real patient records.

The hosted portal requires Supabase storage and Resend email configuration. Without it, authentication/upload routes
fail closed and the clinic screen explains that connection is pending.
The complete two-browser flow is tested locally against durable private test storage.
The local backend is always disabled on Vercel.

Source-cited AI drafts and clinician-requested saved presentations are implemented.
Clinician-edited lifestyle drafts and visit summaries now support exact-version approval, secure email notifications and verified patient PDF access.
See [visit report workflow](docs/visit-reports.md).
Prof. Maor's exact report template and real-data launch controls remain next.
See [clinical processing and presentation setup](docs/clinical-analysis.md).

**galadv73@gmail.com** is the sole protected administrator. Verified staff wait for owner approval.
Only the owner sees user management. Suspension revokes active sessions.

## Languages and invitations

Choose Hebrew or English in the top bar. The preference is remembered in a public language cookie;
English pages can also be opened directly with `?lang=en`, including `/admin?lang=en`.
Hebrew remains the default. The document content and patient-entered names are kept as supplied.
Clinic staff choose the patient invitation language independently of their own workspace language.
Invitation pages include a clinic introduction, preparation steps, help and the existing heart graphic.
OTP emails and API errors follow the chosen interface language. Switching languages keeps active
forms, sign-in verification and uploaded documents intact.

## Routes

- `/`: Hebrew landing page
- `/admin`: six-digit Resend email login and clinic appointment inbox
- `/admin/users`: sole-owner staff approval and user management
- `/invite/[token]`: code verification, PDF selection/upload, confirmation and submission
- `/report/[token]`: email verification and the frozen clinician-approved report/PDF
- `/test-documents`: three fictional Hebrew PDFs and testing instructions
- `/privacy`: current test-stage data handling
- Old `/demo/clinic` redirects to `/admin`; old `/demo/patient` redirects home.

## Setup and hosting

See [private storage and account setup](docs/storage-setup.md).
Run the migrations in order through 008 for sign-in/storage, clinical records, evidence and visit-report delivery in a dedicated Supabase project, verify a sending domain in Resend,
and add server-only service keys and a random secret to Vercel. Do not paste credentials into
source code or commit environment files.

Authentication uses the [Resend raw API](https://resend.com/docs/api-reference/emails/send-email)
and [private Storage](https://supabase.com/docs/guides/storage/security/access-control).
RLS is enabled on every clinical/session/audit table, with no anon/authenticated grants.
Private data is served only through server routes after membership or patient-session checks.

Use Node 24 on a local filesystem. Google Drive streaming folders can fail to extract dependency trees;
build a local copy while retaining the repository source here if needed.

```sh
npm ci
npm run dev
```

## Verification

```sh
npm run lint
npm run build
npm run typecheck
npm run test:database
npx playwright install chromium
npm test
```

PostgreSQL tests execute the actual migration and check RLS, grants, atomic PIN lockout, expired
invitations, duplicate files, submission and session revocation. Browser tests cover Hebrew
desktop/mobile screens, a two-browser/two-PDF round trip, persisted submissions, identical downloaded
bytes, unauthorized access, cross-patient isolation, cancellation, logout, duplicates and CSRF.
A second server proves that hosted mode cannot enable local test credentials.

Tests use a fresh local test directory and a loopback Resend HTTP mock with real random OTPs.
There is no password bypass. Local storage and the mock endpoint are disabled on Vercel.
`tmp/`, `.local-test-data/`, credentials and generated build output are ignored.

## Fictional PDFs

Final copies are in `output/pdf/`; public downloads are in `public/test-documents/`.
They describe one fictional 68-year-old patient with coronary disease and reduced cardiac function.
Every page is clearly labelled fictional and has no real clinic signature or patient identifier.
The generator uses ReportLab, python-bidi and Windows Arial fonts.
Regenerating fixtures updates the hash manifest; copy them into public before rebuilding.

## Product requirements

See [the project plan](docs/project-plan.md) and [Prof. Maor's report contract](docs/report-template.md).
His supplied sample remains the authoritative report structure and visual template.

## Dependency audit

The runtime dependency audit reports no known vulnerabilities.
The development toolchain still reports the upstream `braces` advisory
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Do not force-downgrade Next.js to satisfy the audit tool's major-version suggestion.
