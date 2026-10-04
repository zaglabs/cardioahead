# CardioAhead implementation plan

## Product workflow

1. Secretary creates an appointment and records a verified patient contact number.
2. A random, expiring, revocable invitation is created; only its hash is stored.
3. Patient exchanges the invitation and a one-time code for a scoped session.
4. Patient uploads to private quarantine storage through limited direct-upload authorization.
5. Files are validated/scanned before extraction. Scans and photos receive OCR with page references.
6. A background job extracts structured facts, then prepares a clinician-facing draft report.
7. The professor receives a minimal email notification linking to the authenticated portal.
8. New submissions create new report versions and visibly supersede earlier drafts.

National ID is not a password. Retain identifiers only when the clinic establishes a need.
Do not put patient names, IDs, medical descriptions, or reusable secrets in public URLs.

## Users and access

Individual accounts with MFA for clinic staff. Secretary, professor, and future administrator roles
must have explicit server-side authorization. Document access for the secretary is determined by
the clinic's workflow. Patients are scoped to their own invitation and appointment.

Before real data: test cross-patient isolation, expired/revoked invitations, logout and session expiry,
direct object access, overbroad database policies, and background-worker authorization.

## Core records

Clinic, staff membership, patient, appointment, invitation, document, document extraction,
source evidence, report template, report version, notification attempt, consent/notice event,
and audit event. Preserve historical clinical facts with date, unit, source, and uncertainty.
Keep report generation tied to an immutable document set and template version.

## Report contract

Prof. Maor's supplied summary is the authoritative reference for the final report.
Map documented facts to his sections rather than forcing a generic report structure.
Use deterministic rendering for reliable formatting. Keep source references available in the
dashboard even if the example report does not include footnotes. See report-template.md.

Distinguish reported symptoms from document findings. Preserve medication-list dates.
Flag unreadable, missing, contradictory, or wrong-patient records; never silently fill gaps.
Uploaded documents are untrusted data, including any embedded instructions.
No autonomous diagnosis, treatment recommendation, or raw imaging interpretation in the first release.

## Provider decisions still open

- Patient volume, typical page counts, and supported languages.
- Private-clinic versus hospital governance.
- Approved storage and processing regions and vendor contracts.
- Authentication, storage, OCR, AI, SMS and email suppliers.
- Retention, deletion, backups, and incident handling appropriate to the clinic.
- Patient notices, lawful processing and consent where applicable.

Supabase is a candidate, not a committed production supplier.
Medical content is confidential data requiring a full data-flow and provider review.
Provider marketing statements or a HIPAA agreement alone do not establish Israeli compliance.

## Launch sequence

1. Approve patient UX and the professor's report template with fictional/anonymized examples.
2. Implement authentication and private intake with direct upload, quarantine and audit logs.
3. Implement extraction, source-grounded reports, durable jobs and failure notifications.
4. Have Prof. Maor compare representative outputs with originals, including messy scans,
   bilingual documents, old medications, duplicate files and conflicting records.
5. Complete production security/privacy review and a controlled clinic pilot.

Measure factual errors, important omissions, source correctness, processing failure rate,
and review time. Define acceptance thresholds with the professor before starting the pilot.

## Future heart visualization

Build a medically reviewed anatomical model and clinician-controlled explanation scenes.
An illustration based on a condition must be labelled as schematic.
Exact patient anatomy requires suitable imaging, segmentation, and clinical validation.
The homepage's current decorative SVG is not patient anatomy or the future clinical model.
