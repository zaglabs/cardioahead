# Clinic summaries and saved explanations - implementation status

Hosted pilot:
- Supabase is connected and the owner applied all three migrations.
- Resend email OTP works; the owner confirmed the clinic upload flow.
- Claude is the chosen default, with ANTHROPIC_API_KEY saved in Vercel.
- The owner explicitly approved processing fictional test PDFs. Both upload and AI worker
  enforce the reviewed PDF hashes; filenames and patient labels are excluded from AI metadata.

Implemented:
- Hebrew/English website, patient portal, clinic workspace and user management.
- Source-cited provisional pre-visit reports, six clinical sections, missing information,
  questions, conflicts and clinician review status.
- Background summary preparation after patient submission; durable leases and bounded retry.
- Claude Messages and optional OpenAI Responses provider integrations.
- Simulation / presentation proposals shown before creation.
- Doctor/admin-only Create presentation, private saved slide record and repeat-open reuse.
- Optional motion, full-screen viewing and bilingual SVG educational schematics.
- Private document access, protected sole admin, scoped invitations and access audit records.
- 32 desktop/mobile tests plus four schema/database checks.

Next:
- Prof. Maor's actual report template and clinical review of generated examples.
- Authenticated report notifications and any real-data launch decisions.
- Higher-fidelity image-based anatomy if actual imaging and an approved workflow are provided.

Presentations are source-based educational schematics, not patient anatomy reconstructions,
flow measurements, ECG readings or predicted treatment results. Real-patient uploads remain blocked.
