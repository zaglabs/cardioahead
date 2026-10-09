# Bilingual clinic portal - implementation status

Hosted pilot:
- Supabase is connected through Vercel Marketplace and both migrations have been applied.
- Resend delivery, the sender address and session secret are configured in Production.
- Live OTP requests were accepted and the owner confirmed the clinic flow works.
- Only the three reviewed fictional PDFs are accepted; real-patient uploads remain blocked.

Implemented:
- Hebrew and English landing, patient, clinic, admin, privacy and help screens.
- Top-bar language selector, remembered preference, shareable lang=en/he URLs and matching page direction.
- Localised OTP emails, API errors, dates, status labels and accessibility text.
- Invitation introduction with the landing page heart illustration, preparation instructions and clinic help.
- Independent patient-language selection when clinic staff create an invitation.
- Language switching preserves the login step, draft invitation and uploaded files.
- Sole protected administrator galadv73@gmail.com, approved staff roles and session-revoking suspension.
- Private storage, scoped patient invitations, access-code lockout, audits and document review.
- Database checks and 28 desktop/mobile browser tests.

Next:
- Prof. Maor’s anonymised report sample, source-aware extraction and durable AI processing.
- Authenticated report notifications without medical email attachments.
- Real-data launch controls and the clinic’s provider, retention and privacy decisions.
