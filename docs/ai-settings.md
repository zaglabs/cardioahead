# Anthropic configuration and generation timing

Only the protected administrator can open `/admin/api-keys` or use `/api/clinic/ai-settings`. The page displays key presence as a fixed mask; the raw `ANTHROPIC_API_KEY` stays in Vercel and is never returned to the browser. The Vercel link is where the key is managed.

“Check connection and load models” reads Anthropic's available model catalogue and makes a short structured connection probe without medical information. The probe can use a few tokens. Key presence alone does not mean a successful connection. Failure messages distinguish authentication, credits, model availability and timeouts. A failed probe still retains the available catalogue so an unavailable current model can be replaced.

Saving tests the chosen model before storing its ID in `clinic_ai_settings`. The key is never stored in this table. Apply `202610100009_ai_settings.sql` after migrations 001–008. The private service-only function also enforces the sole-owner role and records model changes. Before this migration, generation uses the existing environment model; the page explains that saving is unavailable. Other database failures stop model resolution rather than silently changing a saved choice.

New Claude requests read the saved selection. Previously saved records remain intact and are reused until the clinician explicitly regenerates them. OpenAI remains optional through the existing provider configuration.

The production evidence failure was confirmed as `AI_TIMEOUT` in the writing stage after the former 75-second request limit. Both evidence and lifestyle generation now request concise drafts from bounded retrieved passages, use longer phase allowances inside one overall job budget, and stream Claude responses internally. Evidence writing permits up to 135 seconds; lifestyle writing up to 125 seconds; verification up to 110 seconds, always capped by the remaining 280-second overall budget and the existing 300-second database lease/function window. The parser requires the completed end-turn event, preserves split UTF-8 characters and rejects truncated, oversized or failed streams. Partial content is never shown or approved.

Verification still checks source IDs, exact passages, patient applicability and the original fictional PDFs. The source snapshot retains the original retrieved records. Smaller input/output bounds do not authorize unsupported claims or bypass review.

All clinic tabs use the shared heart animation for initial loading and processing. The Generate Draft control is prominent near the top and states explicitly that clicking starts generation. Clinic and admin workspaces fill the viewport with responsive gutters; patient reports retain readable text.

Tests cover streamed generation with both language outputs, interrupted/error streams, timeout budgets, restricted key settings, model validation and persistence, masked responses, model choice used by subsequent requests, source verification, existing patient-report permissions and phone/tablet/desktop layouts. AI provider tests use local fixtures; live clinical accuracy still requires clinician review.

Official protocol references: [Models API](https://platform.claude.com/docs/en/api/models/list), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).
