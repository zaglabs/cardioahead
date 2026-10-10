# Personal Clalit collector pilot

This is a local, read-only personal test for the CardioAhead owner, not a general integration for patients. Ordinary PDF uploads still accept only the fictional test files. No Clalit password, login code, browser cookie, original PDF or screenshot is uploaded.

## Run and connect

Use Node 24, the installed Google Chrome browser and the existing project dependencies:

```powershell
npm run clalit:pilot
```

The pilot opens a fresh private Chrome window. Sign into Clalit yourself and select your **own** profile. It does not reuse your existing browser session. The agent then uses INSPECT to find recognized medical menus and COLLECT to navigate read-only sections. You do not need to open each supported record manually. STOP closes the browser and erases the temporary source buffer. The session expires after 45 minutes.

In CardioAhead, log into the owner account and create a new manual patient card for yourself with no uploaded PDFs. In **Sources**, attest that this is your own account and choose whether Claude processing is approved. Click the local collector connection button. It opens a private loopback page on 127.0.0.1:3184, with a 45-minute capability restricted to this card. Review the source names, dates and counts, deselect unwanted sources, and click **Import selected records into CardioAhead**.

The bridge validates the destination card through the fixed CardioAhead HTTPS endpoint. Cross-site requests, foreign hosts and requests without its nonce and scoped capability are rejected. The capability travels in a URL fragment and is removed from browser history immediately. No source text is shown in the console or the local status responses.

After CardioAhead accepts the import, the local buffer is erased. CardioAhead uses the transient text to produce the consent-bound Claude draft. Saved data consists of provenance, the summary, short exact supporting excerpts and the relevance review; full fetched text and original documents are not saved. If processing fails, create a new connection and collect again. An expired connection cannot be reused. Completed summaries are reused without another provider request. No external AI processing occurs when consent is off.

## Coverage

Recognized sections include laboratory results, medical summary, diagnoses, medications, allergies, visit summaries, hospital summaries, imaging and vaccinations. Recognition is not the same as successful extraction.

The verified laboratory adapter reads supported report listings and their result viewers, preserving exact strings, units and labelled dates/references. It checks that the detail reference matches the selected report. Other adapters currently capture supported visible semantic tables. Unrecognized layouts, missing menus, unavailable documents, pagination and collapsed subsections are recorded as coverage gaps; the collector does not claim to read the entire medical file.

A listing is not a full document. Prescriptions and dispensing do not establish current medication use. Unknown source association remains uncertain. Hidden or inaccessible information is never reported as absent disease. The collection receipt prints counts and match flags, never health values, patient identities or token-bearing URLs.

Navigation follows only observed, recognized read-only controls on trusted HTTPS Clalit hosts. It does not invent endpoints, use hidden APIs, export cookies, change profiles, submit care requests, message clinicians or bypass access barriers. Stop if access is blocked.

## Retained clinical output

The bilingual pre-visit draft includes six sections, missing information, questions and an audit of cardiology relevance for every imported source. Potentially important comorbidities are not discarded merely because they lack a cardiac label. Deferred sources retain a reference and a reason; a clinician can mark them relevant for review. This flag does not silently regenerate an existing summary.

A Visual Explanation is offered only when the cited source supports a cardiac location or functional finding. The clinician must explicitly create it. Risk-factor-only blood tests do not produce an invented heart condition. Saved illustrations are explanatory schematics, not reconstructions of the patient's exact anatomy.

Evidence reviews and lifestyle drafts use the retained excerpts under the same personal Claude consent. They disclose that the complete original-document context is unavailable. The patient invitation does not expose private clinical tabs. Existing clinical approval and report-delivery controls remain in place; importing records does not email them to anyone.

Browsers, the operating system, Clalit and the AI provider have their normal data handling. Document-free processing reduces retained copies but is not a zero-retention or compliance guarantee. Real-patient launch still requires the clinic's documented collection, processor, access and retention arrangements.

References: [Clalit medical-summary availability](https://www.clalit.co.il/he/info/services/Pages/howto_medical_summary.aspx), [Clalit confidentiality and online-record limits](https://www.clalit.co.il/he/info/about_site/Pages/confidentiality.aspx), [Clalit medication records](https://www.clalit.co.il/he/info/services/pages/medicine_list.aspx), [Privacy Protection Authority](https://www.gov.il/he/pages/tikun13_qa?chapterIndex=6), [Ministry of Health record management](https://www.gov.il/he/pages/mk09-2019-instructions?chapterIndex=4).

## Collection follow-ups

Read-only menu recognition also handles the observed Clalit labels for consultant visit summaries, hospital summaries, imaging/X-ray results and medications/prescriptions. Clinical tables and report listings are distinguished: a list of visits is not imported as if the complete visit reports were read. Inline read-only controls use their normal UI action rather than bypassing their click handler.

The local connection exposes only the processing state, consent flag, safe error code and last-check time to the collector diagnostics. It never prints the patient-card name, pairing token, source references or health values. After an accepted transfer, raw text is cleared immediately. An old connection reporting a completed summary cannot erase a newer collection pass; collecting and importing are separate operations.

Further imports require a new card-scoped connection and a new source selection. Earlier summaries are retained. The original documents are never attached by this pilot.
