# CardioAhead

Pre-appointment preparation for Prof. Elad Maor.

## Current release

This is an initial, deployable **interface prototype**, not an operational medical-record system.
It contains a Hebrew RTL landing page, a patient preparation demo, and a clinic dashboard demo.
All patients, documents, appointments, and report content are fictional.
No medical files can be selected, uploaded, stored, emailed, or sent to an AI service.
The production admin and invitation routes fail closed.

The final AI summary must match **Prof. Maor's supplied sample report**: section order,
wording conventions, level of detail, language, and PDF layout. The current report is explicitly
a temporary UI example; it must not be treated as the approved template.

## Development

Use Node.js 24 LTS on a local filesystem. Google Drive streaming folders can fail when extracting
large dependency trees; in that case keep the source checkout here and build a copy on a local disk.

```sh
npm ci
npm run dev
```

Routes:

- `/`: landing page
- `/demo/patient`: in-memory, fixture-only preparation walkthrough
- `/demo/clinic`: fictional appointments, status filters, and report/source navigation
- `/admin`: unavailable until real authentication is implemented
- `/invite/[token]`: unavailable for every token until verification exists
- `/privacy`: truthful privacy notice for this prototype
- `/api/intake`: deliberately returns HTTP 503; never parses or forwards medical data

## Verification

```sh
npm run lint
npm run build
npm run typecheck
npx playwright install chromium
npm test
```

The browser tests cover mobile/desktop layouts, demo completion, filters and source links,
and the disabled real-data entry points. GitHub Actions runs the same checks on Node 24.

## Hosting

Import `galadv73/cardioahead` into Vercel as a Next.js project, using Node 24.
The lockfile is committed. No service credentials are required for this prototype.
`.vercel/`, `.env*` (except the example), and build output are ignored.

Attach `cardioahead.com` in Vercel and use **the exact DNS records shown for that project**.
Do not assume generic IP addresses or overwrite unrelated registrar records.
Set the canonical domain and HTTPS before inviting real patients.

The repository is public. Never commit clinical examples containing real patient information,
uploaded documents, identifiers, access tokens, or service credentials.

## Next implementation stage

See [the project specification](docs/project-plan.md) and
[the report-template requirements](docs/report-template.md).
Authentication, scoped invitations, private storage, document extraction, AI processing,
email notifications, audit trails, and production privacy/security review remain to be implemented.

## Dependency audit note

The production dependency audit reports no known vulnerabilities at the initial release.
The full audit reports an unpatched `braces` advisory through the Next.js ESLint tooling
(development dependencies only): [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
Do not force-downgrade Next.js to resolve the tool's suggested major-version change.
Recheck when the upstream dependency is patched. Runtime code does not process glob patterns.
