# No-download Clalit feasibility test

This separate owner-only test checks a temporary Browserbase-hosted browser before changing patient invitations. It is not an official Clalit API integration. The production patient flow remains the desktop collector pilot until compatibility and login usability are verified.

## Start

From the local build checkout with installed dependencies, run:

```powershell
npm run clalit:remote
```

Open the `PRIVATE_TEST_URL` shown by the launcher. The test coordinator binds only to `127.0.0.1:3194`; the medical browser runs remotely. Codex starts this coordinator for the owner. Patients would not need a download or an API key in a future hosted deployment.

1. Create or use a Browserbase account and obtain its API key. Enter it in the masked field on the private test page, not in chat. The optional project ID selects an existing project. The key is held in memory only; no environment file or browser storage is written.
2. Read and accept the hosted-session disclosure. Click **Open Clalit browser**.
3. Sign into the genuine Clalit page yourself, including SMS verification, and choose your **own** profile. The test does not inspect or fill login fields. The agent stays paused until you explicitly ask it to check record access.
4. Confirm your own-account selection and temporary-read consent. Click **Check my record access**. The existing supported read-only adapters navigate the medical sections. Only counts and coverage statuses are displayed; original documents and extracted text are not uploaded, saved or sent to AI. Extracted text is cleared after counting.
5. Click **Close session & clear**. This disconnects the agent and requests termination of the hosted browser. Failure to confirm termination is reported; retry closing or end the session in the Browserbase dashboard. A provider-side 15-minute session timeout is also configured.

Closing just the local page is not the same as terminating the hosted session. Use the close button. The launcher also closes on SIGINT/SIGTERM. When the local pilot is restarted, sign in again; no persistent Browserbase context or user profile is configured.

## Boundaries

Browserbase processes the login session and displayed medical information. The code requests `recordSession: false` and `logSession: false`, without saved contexts, proxy routing, automated CAPTCHA solving, stealth overrides or certificate-validation bypasses. Those settings reduce capture but do not establish zero retention or production compliance. Browserbase's service metadata and Clalit's own processing remain subject to their handling.

No Clalit login, cookies, session endpoint, service key, clinical values, titles or source references are exposed in the public status responses or console. A short-lived interactive view capability is available only through the authorized local test page; treat the URL as private. Source text temporarily exists in the isolated browser and in the local adapter's memory. Session close clears the adapter buffer and releases the remote browser; secure physical erasure by other services is not claimed.

The coordinator requires a random private link capability, same-origin authorization, HttpOnly/SameSite cookie or an in-memory page-scoped bearer token, a CSRF token and an exact loopback Host header. The bearer token supports embedded browsers that block the local cookie; it is delivered only after private-link authorization and never placed in a URL or browser storage. It sends no CORS headers. CSP prevents embedding the test page and restricts the remote iframe to Browserbase. Service failures are sanitized. The API key and CDP endpoint never reach the browser-facing status or view responses.

A successful login page load does not mark a connection successful. A medical-record root plus a visible session-exit control must be found after user consent. A connection does not mean extraction succeeded: record counts and coverage are reported separately. Listings are not represented as complete visit/imaging reports. This test has no CardioAhead import capability or connection-status writes.

Stop if Clalit blocks the remote session. Do not add proxies or anti-detection workarounds to get around provider restrictions. Desktop login is tested first; mobile keyboard input and navigation need a separate test. Browserbase's documentation currently notes that mobile keyboards need additional handling.

## Verification

`npm run test:clalit-remote` uses fictional provider responses and local browser fixtures. It checks consent, sanitized failures, disabled recording/logging, no automatic extraction, authentication detection, counts-only output, clearing, session cancellation/release, loopback access controls, masked keys and a narrow-screen layout. It does not establish live Clalit compatibility.

A live pass requires observing: genuine sign-in works; the patient can interact with the embedded view; supported records are actually read; closing is confirmed. Once those pass, a separate production design can pair a hosted session with the invitation's existing PIN/consent grant and retain the existing review-before-import step.

References: [Session creation/settings](https://docs.browserbase.com/reference/api/create-a-session), [Live view and mobile limitations](https://docs.browserbase.com/platform/browser/observability/session-live-view), [Session termination](https://docs.browserbase.com/reference/api/update-a-session), [Browserbase plans](https://www.browserbase.com/pricing).
## Setup feedback

The start button immediately disables and shows the opening state. Errors appear beside the form and scroll into view. The masked API-key field is cleared only when setup succeeds, so a validation or connection failure does not require repasting the key. Authenticated status exposes only the last start-request time, HTTP status and safe error code for troubleshooting, never request bodies or headers.

## Live feasibility result — 11 October 2026

The owner verified Browserbase credentials and started an isolated hosted session. The Clalit login URL displayed an Imperva **Access denied / Error 16** page before sign-in. The precise security rule is unknown. This test therefore did not establish hosted Clalit access or extraction compatibility.

The coordinator confirmed zero extracted records, disabled uploads and disabled AI processing. The remote session was closed, and the provider accepted the release request. No medical records were imported. No login credentials, IP addresses, incident IDs or interactive-session URLs are recorded in this result.

Future test sessions detect public access-denied indicators, close before collection and show a Clalit-specific failure. They do not change routing, enable stealth or solve challenges in response to a security block. An authorized provider connection/allowlisting must be investigated before treating this remote-browser approach as viable. The patient invitation flow has not been replaced with hosted import.