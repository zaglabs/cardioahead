# Clinical summaries and saved patient explanations

## Activation

Apply `supabase/migrations/202610090003_clinical_records.sql` once after the first two migrations.
It adds private analysis/presentation tables, leases, bounded retries, clinician-only review and
atomic presentation creation. No public/anon/authenticated table or RPC access is granted.

In Vercel Production:

- `ANTHROPIC_API_KEY`: the sensitive Claude API key.
- `CARDIOAHEAD_AI_PROVIDER=claude`: current owner preference.
- `CARDIOAHEAD_ENABLE_CLAUDE_TEST_PDFS=true`: explicitly approved fictional-document scope.
- `CLAUDE_MODEL`: optional; defaults to `claude-sonnet-4-6`.
- Optional OpenAI: `OPENAI_API_KEY`, `CARDIOAHEAD_AI_PROVIDER=openai`,
  `CARDIOAHEAD_ENABLE_OPENAI_TEST_PDFS=true`, optional `OPENAI_MODEL` (default `gpt-5.4`).

There is no automatic fallback between providers. Changing the provider affects only new summaries.
Existing summaries and presentations stay saved without additional provider calls.

## Flow

Patient submission locks the uploaded document set and queues a source-based summary.
The post-response worker prepares the draft in the background. A clinician opening an older
submitted record starts its missing summary. An expired worker lease can be resumed; failed runs
can be retried after a minute, with a maximum of three attempts.

Six report sections: referral, cardiac history, findings, medication reconciliation, allergies
and documented plan. Missing information, conflicts, questions and limitations remain visible.
The output is bilingual. Each clinical fact carries a supplied document ID, real page number and
short supporting excerpt. IDs/pages and the complete result structure are validated server-side.
These mechanical checks do not establish clinical truth; clinician source review remains required.
The report is a provisional format until Prof. Maor supplies his own template.

The Simulation / presentation tab shows only the model's proposed outline initially.
A doctor/professor or administrator must click Create presentation. A private, versioned slide
record is then saved. Subsequent creation requests return the same record. Reopening or changing
interface language does not rerun the model or recreate the presentation.

Supported scenes are educational SVG schematics: heart pumping, artery narrowing, documented stent
support, valve/electrical-function concepts and care-discussion cards. Motion is optional. There are
no patient anatomy reconstructions, computed flows, fake ECG readings or projected treatment outcomes.
Medication and procedure discussion follows the supplied records; it is not a new prescription.
Review status is explicit and never attributed to Prof. Maor automatically.

## Data boundary

Only the three reviewed fictional PDFs can be uploaded and processed. The worker checks every PDF's
actual SHA-256 again immediately before submission, including files inserted outside the upload UI.
Patient labels and user-supplied filenames are never sent to the provider as metadata.
No original medical files are sent by ordinary email. Secret values and document/model content are
not printed to application logs. OpenAI requests use store=false; provider retention policies still
need approval before any future real-data launch.

## Tests

Tests use loopback-only mock providers and actual approved PDF bytes, with independent local stores.
They verify automatic summary preparation, citation validation, no presentation before the click,
saved-record reuse without another model call, clinician authorization and denied patient access.
The provider mock and local backend cannot run in hosted mode.

Official API references:

- [Claude PDF input](https://platform.claude.com/docs/en/build-with-claude/pdf-support)
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [OpenAI PDF input](https://developers.openai.com/api/docs/guides/file-inputs)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Scoped personal Clalit pilot

The protected owner can separately pair a read-only local collector to a new, document-free manual card after attesting self-account scope and explicitly consenting to Claude. This exception does not enable real PDF uploads or collection from other patients.

Migration 010 stores provenance, short exact supporting excerpts and summary/relevance output, never original documents or full fetched source text. The collector clears its temporary buffer after an accepted transfer, at expiry and on shutdown. The server passes source text only in transient processing memory. No OpenAI fallback is permitted for these personal records. Failed processing requires recollection; completed summaries and clinician-created visuals are reused.

See [the collector workflow](clalit-pilot.md) for coverage limits, source review and pairing.
