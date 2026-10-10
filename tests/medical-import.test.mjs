import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  validateMedicalBundle,
  validateMedicalSummary,
  medicalMetadataBundle,
  medicalEvidenceBundle,
} from "../src/lib/medical-import/schema.mjs";
let owner = "11111111-1111-4111-8111-111111111111",
  prof = "22222222-2222-4222-8222-222222222222",
  secretary = "33333333-3333-4333-8333-333333333333",
  card = "44444444-4444-4444-8444-444444444444",
  record = "55555555-5555-4555-8555-555555555555",
  lease = "66666666-6666-4666-8666-666666666666";
const bi = (text) => ({ he: text, en: text });
const bundle = {
  schema_version: 1,
  provider: "clalit",
  subject_scope: "self",
  collected_at: "2026-01-01T00:00:00Z",
  coverage: [{ category: "laboratory", status: "captured", record_count: 1 }],
  records: [
    {
      id: record,
      category: "laboratory",
      title: "FICTIONAL lab report",
      record_date: "01.01.2026",
      provider_reference: "fictional-report-001",
      source_origin: "https://e-services.clalit.co.il",
      source_path: "/fictional-results",
      association_verified: true,
      entries: [
        { id: "entry_1", text: "FICTIONAL_SYNTHETIC_ALPHA: 7.3 mg/dL" },
        { id: "entry_2", text: "UNUSED_FICTIONAL_VALUE: 1.25" },
      ],
    },
  ],
};
const citation = {
  record_id: record,
  entry_id: "entry_1",
  quote: "FICTIONAL_SYNTHETIC_ALPHA: 7.3 mg/dL",
};
const fact = {
  text: bi("A fictional value was documented."),
  date: "01.01.2026",
  refs: [citation],
};
const summary = {
  overview: fact,
  sections: [
    "referral",
    "history",
    "findings",
    "medications",
    "allergies",
    "plan",
  ].map((kind) => ({
    kind,
    title: bi(kind),
    items: kind === "findings" ? [fact] : [],
    missing: [],
  })),
  questions: [],
  limitations: [bi("Fictional fixture only; no diagnosis.")],
  relevance: [
    {
      record_id: record,
      priority: "primary",
      reason: bi("Fictional laboratory information."),
      refs: [citation],
    },
  ],
  visual_proposal: {
    eligible: false,
    reason: bi("No documented cardiac anatomy or function."),
    slides: [],
  },
};
test("structured inputs exclude credential/file fields, require self scope and safe source references", () => {
  assert.equal(validateMedicalBundle(bundle).records.length, 1);
  for (const altered of [
    { ...bundle, cookies: "secret" },
    { ...bundle, subject_scope: "family" },
    {
      ...bundle,
      records: [
        {
          ...bundle.records[0],
          source_origin: "https://clalit.co.il.evil.invalid",
        },
      ],
    },
    {
      ...bundle,
      records: [
        { ...bundle.records[0], source_path: "/results?session=secret" },
      ],
    },
  ])
    assert.throws(
      () => validateMedicalBundle(altered),
      /INVALID_MEDICAL_BUNDLE/,
    );
  assert.equal(validateMedicalSummary(summary, bundle).relevance.length, 1);
  assert.throws(
    () =>
      validateMedicalSummary(
        {
          ...summary,
          overview: {
            ...fact,
            refs: [{ ...citation, quote: "invented result" }],
          },
        },
        bundle,
      ),
    /INVALID_IMPORTED_SUMMARY/,
  );
  assert.throws(
    () => validateMedicalSummary({ ...summary, relevance: [] }, bundle),
    /INVALID_IMPORTED_SUMMARY/,
  );
  const deferred = {
    ...summary,
    relevance: [{ ...summary.relevance[0], priority: "deferred" }],
  };
  assert.throws(
    () => validateMedicalSummary(deferred, bundle, { [record]: true }),
    /INVALID_IMPORTED_SUMMARY/,
  );
  assert.throws(
    () =>
      validateMedicalSummary(deferred, {
        ...bundle,
        records: [{ ...bundle.records[0], association_verified: false }],
      }),
    /INVALID_IMPORTED_SUMMARY/,
  );
});
test("storage retains provenance and cited audit excerpts, never full collected source text", () => {
  const metadata = medicalMetadataBundle(bundle);
  assert.equal(metadata.records[0].entries.length, 0);
  assert.equal(metadata.records[0].entry_count, 2);
  assert.ok(!JSON.stringify(metadata).includes("7.3"));
  const excerpts = medicalEvidenceBundle(bundle, summary);
  assert.equal(excerpts.records[0].entries.length, 1);
  assert.equal(excerpts.records[0].entries[0].text, citation.quote);
  assert.ok(!JSON.stringify(excerpts).includes("UNUSED_FICTIONAL_VALUE"));
  assert.equal(bundle.records[0].entries.length, 2);
});
test("private grants enforce the owner, separate cards, consent, idempotency, leases, clinician review and deletion", async () => {
  const db = new PGlite();
  const q = (text, params = []) => db.query(text, params);
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202610040001_portal.sql",
      "202610040002_staff_otp.sql",
      "202610090003_clinical_records.sql",
      "202610100004_clinic_intake.sql",
      "202610100005_deletion.sql",
      "202610100006_clinical_evidence.sql",
      "202610100007_visit_reports.sql",
      "202610100008_report_reissue_guard.sql",
      "202610100009_ai_settings.sql",
      "202610100010_medical_imports.sql",
    ])
      await db.exec(fs.readFileSync("supabase/migrations/" + name, "utf8"));
    owner = (
      await q(
        "select id from public.clinic_staff where email='galadv73@gmail.com'",
      )
    ).rows[0].id;
    await q(
      "insert into public.clinic_staff(id,email,role,status) values($1,'galadv73@gmail.com','admin','active'),($2,'professor@fictional.test','professor','active'),($3,'secretary@fictional.test','secretary','active') on conflict(email) do nothing",
      [owner, prof, secretary],
    );
    await q(
      "insert into public.appointments(id,patient_label,status,token_hash,pin_digest,expires_at,created_by,intake_mode) values($1,'Fictional personal card','invited',repeat('a',64),repeat('b',64),now()+interval '1 day',$2,'clinic')",
      [card, owner],
    );
    await assert.rejects(
      () =>
        q(
          "select public.create_medical_import_grant($1,$2,repeat('c',64),true)",
          [prof, card],
        ),
      /owner required/,
    );
    await q(
      "select public.create_medical_import_grant($1,$2,repeat('c',64),true)",
      [owner, card],
    );
    await assert.rejects(
      () =>
        q(
          "select public.accept_medical_import(repeat('c',64),repeat('d',64),$1)",
          [JSON.stringify(bundle)],
        ),
      /provenance only/,
    );
    const inserted = (
      await q(
        "select public.accept_medical_import(repeat('c',64),repeat('d',64),$1) as result",
        [JSON.stringify(medicalMetadataBundle(bundle))],
      )
    ).rows[0].result;
    const duplicate = (
      await q(
        "select public.accept_medical_import(repeat('c',64),repeat('d',64),$1) as result",
        [JSON.stringify(medicalMetadataBundle(bundle))],
      )
    ).rows[0].result;
    assert.equal(duplicate.id, inserted.id);
    assert.equal(duplicate.reused, true);
    await assert.rejects(
      () =>
        q(
          "select public.accept_medical_import(repeat('c',64),repeat('e',64),$1)",
          [JSON.stringify(medicalMetadataBundle(bundle))],
        ),
      /already used/,
    );
    assert.equal(
      (
        await q(
          "select personal_import_source,medical_records_count from public.appointments where id=$1",
          [card],
        )
      ).rows[0].medical_records_count,
      1,
    );
    await q(
      "select public.create_medical_import_grant($1,$2,repeat('f',64),false)",
      [owner, card],
    );
    const noConsent = (
      await q(
        "select public.accept_medical_import(repeat('f',64),repeat('9',64),$1) as result",
        [JSON.stringify(medicalMetadataBundle(bundle))],
      )
    ).rows[0].result;
    assert.equal(
      (
        await q("select public.claim_medical_summary($1,$2,$3) as claimed", [
          noConsent.id,
          owner,
          lease,
        ])
      ).rows[0].claimed,
      false,
    );
    assert.equal(
      (
        await q("select public.claim_medical_summary($1,$2,$3) as claimed", [
          inserted.id,
          owner,
          lease,
        ])
      ).rows[0].claimed,
      true,
    );
    assert.equal(
      (
        await q("select public.claim_medical_summary($1,$2,$3) as claimed", [
          inserted.id,
          owner,
          lease,
        ])
      ).rows[0].claimed,
      false,
    );
    await assert.rejects(
      () =>
        q("select public.finish_medical_summary($1,$2,$3,'openai-test',$4)", [
          inserted.id,
          lease,
          JSON.stringify(summary),
          JSON.stringify(medicalEvidenceBundle(bundle, summary)),
        ]),
      /approved provider/,
    );
    assert.equal(
      (
        await q(
          "select public.finish_medical_summary($1,$2,$3,'claude-fictional-test',$4) as finished",
          [
            inserted.id,
            lease,
            JSON.stringify(summary),
            JSON.stringify(medicalEvidenceBundle(bundle, summary)),
          ],
        )
      ).rows[0].finished,
      true,
    );
    await assert.rejects(
      () =>
        q("select public.review_medical_import($1,$2,null,true)", [
          inserted.id,
          secretary,
        ]),
      /clinician required/,
    );
    assert.equal(
      (
        await q(
          "select public.review_medical_import($1,$2,$3,true) as reviewed",
          [inserted.id, prof, record],
        )
      ).rows[0].reviewed,
      true,
    );
    assert.equal(
      (
        await q(
          "select public.review_medical_import($1,$2,null,true) as reviewed",
          [inserted.id, prof],
        )
      ).rows[0].reviewed,
      true,
    );
    await assert.rejects(
      () =>
        q("select public.save_medical_visual($1,$2,'{}')", [inserted.id, prof]),
      /no supported proposal/,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        () => q("select * from public.medical_record_imports"),
        /permission denied/,
      );
      await assert.rejects(
        () => q("select * from public.medical_import_grants"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await q(
      "update public.appointments set deletion_requested_at=now() where id=$1",
      [card],
    );
    await assert.rejects(
      () =>
        q(
          "select public.create_medical_import_grant($1,$2,repeat('1',64),true)",
          [owner, card],
        ),
      /personal clinic card/,
    );
    await q("delete from public.appointments where id=$1", [card]);
    assert.equal(
      (
        await q(
          "select count(*)::integer as n from public.medical_record_imports",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
