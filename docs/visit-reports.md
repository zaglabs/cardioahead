# Prevention & Lifestyle and Visit Summary

The clinic record contains two bilingual workspaces. Active clinic staff may prepare/edit lifestyle drafts. Only the administrator and professor roles may edit clinician findings and visit summaries, approve a report or send/revoke/reissue its secure link.

## Clinic workflow

1. Open a fictional patient card with approved test PDFs.
2. In Prevention & Lifestyle, generate a draft. Inspect its documented facts, quoted evidence, missing-information notes and clearance flags. Edit or remove patient wording, save a new version, and select recommendations to copy into the visit summary.
3. In Visit Summary, enter and save clinician findings. AI generation may then propose readable wording. Empty clinician fields cannot become invented visit events, and entered medication instructions are copied unchanged.
4. Edit report identity, visit date, clinician/clinic/contact details, every section, copied recommendations and Your Next Steps.
5. Enter the intended recipient and report language. Open the final patient preview and optionally its PDF. Return to editing or explicitly approve the exact version and recipient.
6. Approval does not send anything. Confirm the recipient again to send the generic secure-link notification through the raw Resend API.

Subsequent report edits invalidate approval. A corrected report requires fresh approval. Reports/PDFs previously approved and sent remain immutable. Lifestyle changes never silently overwrite recommendations already copied into a summary.

Regeneration offers preservation of the edited draft with a separate candidate, or explicit replacement; both retain prior versions. New documents or clinician findings flag draft sources as outdated and require acknowledgement before approval/sending.

## Patient access

Notifications contain no patient names, identifiers or medical findings. The seven-day random link requires a separate browser-bound six-digit email verification code sent only to the approved recipient. Codes expire after ten minutes, are single-use, permit five attempts and have per-link/IP rate limits. Verified sessions last at most two hours and are scoped to that delivery. Public responses expose no report identity/content before verification.

The patient sees only the frozen approved report and can download exactly the saved PDF bytes. Staff drafts, clinical evidence and visual explanations remain private. Revocation invalidates sessions; reissue revokes the earlier link for that approval and creates a new notification. Repeated reissue requests carry the earlier delivery ID to prevent another notification.

## Configuration

Apply migrations in order through 007 and 008:
- `202610100007_visit_reports.sql` creates the private version/approval/delivery/access tables and service-only functions.
- `202610100008_report_reissue_guard.sql` updates one function to bind reissue requests to the previous delivery.

The existing Supabase service configuration, `CARDIOAHEAD_SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, selected AI provider key and fictional-PDF processing consent flags are reused. `NEXT_PUBLIC_SITE_URL` must point to the canonical HTTPS site. No secrets belong in browser variables. Bundled OFL Noto fonts support Hebrew PDF rendering.

A missing email connection blocks sending; a missing AI connection blocks AI generation. Clinician editing remains available. The application accepts only byte-whitelisted fictional PDFs during the pilot.

## Delivery and audit

Approval freezes localized content, recipient, clinician identity, timestamp and PDF/hash. Versions preserve author, source document version, clinician-findings version and evidence context. Send attempts have an atomic lease and stable Resend idempotency key/payload; repeated clicks reuse the active attempt. Failed or unconfirmed sends preserve approval. Retries use the same encrypted token and exact stored payload within the controlled retry window; older attempts require explicit reissue.

“Accepted” means the email API accepted the notification. “Check delivery status” queries Resend's last event to distinguish confirmed delivery and failures. There are no webhooks. Changing the recipient requires explicit revocation of links sent to other addresses. Application logs contain controlled error codes rather than report content.

## Verification

`npm run test:database` runs all SQL migrations against PostgreSQL/PGlite and verifies permissions, immutable snapshots, approval invalidation, generation races, send/reissue deduplication, retry, code expiry/rates and session revocation.

`tests/visit.spec.ts` covers fictional clinic workflows through both Claude and OpenAI local HTTP fixtures, independent recommendation copies, source changes, UI preview/PDF/approval/send, failed delivery retry, secretary restrictions, patient OTP isolation, exact PDF download and mobile layouts. English and Hebrew PDFs are rendered and visually inspected. Provider fixtures verify integration and workflow; they do not establish live-model clinical accuracy. All generated content still requires clinician review.
