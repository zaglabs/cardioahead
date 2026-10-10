# Invitation flow and guided Clalit pilot

Migration 011 adds private invitation history, encrypted link/code recovery, actual activity tracking, email attempts and consented patient import grants. It is already applied in the production project. Do not rerun it or edit its deployed contents.

Patients enter their invitation PIN, then choose Upload Documents or Import from Clalit. Manual uploads remain restricted to the reviewed fictional PDFs during the pilot. The Clalit option is a Windows/Chrome desktop pilot with a portable collector. Phone users get an explicit explanation and the upload/help alternatives.

The desktop download includes Node.js 24.19.0, Playwright Core and their licenses. It includes only a source whitelist and dependencies: no environment variables, API keys, medical records, cookies or test data. Extract the folder and open Start CardioAhead. The first setup may require clinic/family assistance. The launcher opens the private local UI without requiring terminal commands or development tools.

The patient signs into Clalit themselves, attests that the selected profile is their own, starts collection, reviews the source names/dates and selects the records to import. The collector uses the verified read-only adapters; coverage remains partial. It never calls hidden provider APIs, exports cookies, enters passwords or bypasses access barriers. Original documents remain with the provider.

Pairing is scoped to a valid PIN-authenticated patient session, a current invitation, self-account attestation and explicit Anthropic consent. The 45-minute capability is bound locally to a single collection. Switching an empty collector to a newly authorized connection closes the previous medical browser context and retires the old capability locally; a populated collection cannot be reassigned to another invitation. Host, Origin and nonce protections remain mandatory. Only the fixed CardioAhead HTTPS destination receives selected records.

The server stores provenance before processing. Full source text is transient; completed summaries retain only exact cited excerpts and metadata. Patient sources always use consent-bound Claude with no OpenAI fallback. Clinical summaries, evidence and visuals stay in the clinic area. Patient invitation APIs return progress and counts, never clinical draft content. Visuals still require an explicit clinician action.

Tracking definitions:
- Link viewed: a visible browser page reported a view of a valid link. It does not establish patient identity.
- Access verified: a correct PIN produced a patient session; wrong codes do not create activity.
- Patient upload: the document was saved and its patient-upload audit event committed. Staff uploads and historical unknown upload sources are distinguished.
- Clalit connection: valid, source-associated records arrived from the scoped collector. Opening the instructions or creating a pairing grant does not mark it connected. This is a collector-record receipt, not an official Clalit OAuth claim.
- Import complete: the validated Claude summary/excerpt bundle was saved successfully. Failed, pending, revoked and expired flows do not get a successful-import timestamp.
- Email accepted: Resend returned an accepted provider ID. This does not claim final email delivery.

Staff can search and filter all issued invitations with pagination, reveal/copy credentials, resend, extend expiry, create replacement links, revoke and delete invitations. Deletion archives the invitation and revokes sessions while preserving the patient card and clinical records. Deleted invitations can be included through a filter. Replacements revoke the previous link and code while preserving issuance history.

Existing invitation tokens/PINs were hashes only, so migration 011 cannot recover old secrets. Historical rows show truthful available audit information and provide an explicit replacement flow. New recoverable credentials use AES-256-GCM with invitation/card/token-hash binding. They are decrypted only for active staff actions and are never returned in list APIs or stored in localStorage.

Production flags:
- CARDIOAHEAD_ENABLE_PATIENT_CLALIT_PILOT=true enables the guided invitation path.
- ANTHROPIC_API_KEY stays a Sensitive server-only Production variable.
- CARDIOAHEAD_COLLECTOR_DOWNLOAD_URL can override the verified HTTPS release asset URL; the default points to the project release collector-v0.2.0.
- CARDIOAHEAD_SESSION_SECRET protects PIN digests and encrypted invitation credentials. A secret rotation requires replacing existing invitation links.

No original-document retention or blanket zero-retention/compliance guarantee is implied. The clinic remains responsible for its approved processing, access and clinical retention arrangements.