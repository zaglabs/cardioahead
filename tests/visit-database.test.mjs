import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
test("visit workflow enforces immutable versions, exact approval, idempotent sending and scoped expiring access", async () => {
  const db = new PGlite();
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
    ])
      await db.exec(
        fs.readFileSync(
          path.join(process.cwd(), "supabase/migrations", name),
          "utf8",
        ),
      );
    const owner = (
        await db.query(
          "select id from public.clinic_staff where email='galadv73@gmail.com'",
        )
      ).rows[0].id,
      secretary = randomUUID(),
      patient = randomUUID();
    await db.query(
      "insert into public.clinic_staff(id,email,role,status) values($1,'secretary@fictional.test','secretary','active')",
      [secretary],
    );
    await db.query(
      "insert into public.appointments(id,patient_label,token_hash,pin_digest,expires_at,created_by) values($1,'Fictional report','token','pin',now()+interval '7 days',$2)",
      [patient, owner],
    );
    const act = async (action, payload, actor = owner) =>
      (
        await db.query(
          "select public.mutate_visit_record($1,$2,$3,$4::jsonb) as value",
          [actor, patient, action, JSON.stringify(payload)],
        )
      ).rows[0].value;
    const save = (
      kind,
      base,
      data = { message: "original fictional content" },
      actor = owner,
    ) =>
      act(
        "save_" + kind,
        {
          base_version_id: base,
          data,
          source_snapshot: {},
          document_version: "docs-v1",
        },
        actor,
      );
    await assert.rejects(() => save("summary", null, {}, secretary));
    await save("lifestyle", null, {}, secretary);
    const v1 = await save("summary", null);
    const approvalPayload = {
      version_id: v1.id,
      reviewed: true,
      language: "he",
      recipient: "patient@fictional.test",
      content_hash: "exact-v1",
      snapshot: { message: "original fictional content" },
      pdf_base64: "cGRm",
      pdf_sha256: "pdf-v1",
    };
    await assert.rejects(() =>
      act("approve", { ...approvalPayload, reviewed: false }),
    );
    await assert.rejects(() =>
      act("approve", { ...approvalPayload, reviewed: undefined }),
    );
    await assert.rejects(() => act("approve", approvalPayload, secretary));
    const ap = await act("approve", approvalPayload);
    await assert.rejects(() =>
      db.query(
        "update public.patient_report_approvals set snapshot='{}' where id=$1",
        [ap.id],
      ),
    );
    await assert.rejects(() =>
      db.query(
        "update public.patient_record_versions set data='{}' where id=$1",
        [v1.id],
      ),
    );
    const sendPayload = () => ({
      approval_id: ap.id,
      confirmed_recipient: ap.recipient,
      content_hash: ap.content_hash,
      delivery_id: randomUUID(),
      attempt_id: randomUUID(),
      token_hash: randomUUID(),
      token_encrypted: "encrypted",
      notice_payload: {
        to: [ap.recipient],
        subject: "A secure document is available",
        text: "Secure link",
      },
    });
    const firstPayload = sendPayload();
    await assert.rejects(() =>
      act("claim_send", {
        ...firstPayload,
        confirmed_recipient: "other@fictional.test",
      }),
    );
    await assert.rejects(() => act("claim_send", firstPayload, secretary));
    const first = await act("claim_send", firstPayload);
    assert.equal(first.send, true);
    const duplicate = await act("claim_send", sendPayload());
    assert.equal(duplicate.send, false);
    assert.equal(duplicate.delivery.id, first.delivery.id);
    await assert.rejects(() =>
      save("summary", v1.id, { message: "changed during sending" }),
    );
    assert.equal(
      (
        await db.query(
          "select public.finish_report_send($1,$2,'failed',null,'EMAIL_UNAVAILABLE') as ok",
          [first.delivery.id, firstPayload.attempt_id],
        )
      ).rows[0].ok,
      true,
    );
    const retryPayload = sendPayload(),
      retry = await act("claim_send", retryPayload);
    assert.equal(retry.delivery.id, first.delivery.id);
    assert.equal(retry.delivery.attempts, 2);
    assert.deepEqual(
      retry.delivery.notice_payload,
      first.delivery.notice_payload,
    );
    await db.query(
      "select public.finish_report_send($1,$2,'accepted','provider-id',null)",
      [retry.delivery.id, retryPayload.attempt_id],
    );
    assert.equal((await act("claim_send", sendPayload())).send, false);
    const reissuedPayload = {
      ...sendPayload(),
      reissue: true,
      expected_delivery_id: first.delivery.id,
    };
    const reissued = await act("claim_send", reissuedPayload);
    assert.equal(reissued.send, true);
    const repeated = await act("claim_send", {
      ...sendPayload(),
      reissue: true,
      expected_delivery_id: first.delivery.id,
    });
    assert.equal(repeated.send, false);
    assert.equal(repeated.delivery.id, reissued.delivery.id);
    await db.query(
      "select public.finish_report_send($1,$2,'accepted','provider-new',null)",
      [reissued.delivery.id, reissuedPayload.attempt_id],
    );
    assert.equal(
      (
        await act("claim_send", {
          ...sendPayload(),
          reissue: true,
          expected_delivery_id: first.delivery.id,
        })
      ).send,
      false,
    );
    first.delivery = reissued.delivery;
    const challenge = {
      id: "browser-bound",
      delivery_id: first.delivery.id,
      code_digest: "correct",
      ip_hash: "hashed-ip",
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 600000).toISOString(),
    };
    assert.equal(
      (
        await db.query("select public.reserve_report_code($1::jsonb) as ok", [
          JSON.stringify(challenge),
        ])
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query("select public.reserve_report_code($1::jsonb) as ok", [
          JSON.stringify({ ...challenge, id: "rate-limited" }),
        ])
      ).rows[0].ok,
      false,
    );
    await db.query(
      "update public.patient_report_challenges set delivered=true where id='browser-bound'",
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_report_code('browser-bound',$1,'wrong','wrong-session') as ok",
          [first.delivery.id],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_report_code('browser-bound',$1,'correct','verified-session') as ok",
          [first.delivery.id],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_report_code('browser-bound',$1,'correct','replay') as ok",
          [first.delivery.id],
        )
      ).rows[0].ok,
      false,
    );
    await db.query(
      "update public.patient_report_deliveries set expires_at=now()-interval '1 second' where id=$1",
      [first.delivery.id],
    );
    assert.equal(
      (
        await db.query("select public.reserve_report_code($1::jsonb) as ok", [
          JSON.stringify({ ...challenge, id: "expired" }),
        ])
      ).rows[0].ok,
      false,
    );
    await db.query(
      "update public.patient_report_deliveries set expires_at=now()+interval '7 days' where id=$1",
      [first.delivery.id],
    );
    const v2 = await save("summary", v1.id, {
      message: "corrected fictional content",
    });
    assert.equal(
      (
        await db.query(
          "select approval_id from public.patient_visit_workspaces where appointment_id=$1",
          [patient],
        )
      ).rows[0].approval_id,
      null,
    );
    await assert.rejects(() => act("claim_send", sendPayload()));
    assert.deepEqual(
      (
        await db.query(
          "select snapshot from public.patient_report_approvals where id=$1",
          [ap.id],
        )
      ).rows[0].snapshot,
      approvalPayload.snapshot,
    );
    const gen = await act("generate_summary", {
      base_version_id: v2.id,
      document_version: "docs-v1",
      regeneration_decision: "preserve",
    });
    const candidate = (
      await db.query(
        "select public.finish_patient_draft($1,$2::jsonb,'{}') as value",
        [gen.job.id, JSON.stringify({ message: "new AI candidate" })],
      )
    ).rows[0].value;
    assert.ok(candidate.id);
    assert.equal(
      (
        await db.query(
          "select summary_id from public.patient_visit_workspaces where appointment_id=$1",
          [patient],
        )
      ).rows[0].summary_id,
      v2.id,
    );
    const gen2 = await act("generate_summary", {
      base_version_id: v2.id,
      document_version: "docs-v1",
      regeneration_decision: "replace",
    });
    await save("summary", v2.id, {
      message: "doctor changed content while generation ran",
    });
    assert.equal(
      (
        await db.query(
          "select public.finish_patient_draft($1,'{}','{}') as value",
          [gen2.job.id],
        )
      ).rows[0].value,
      null,
    );
    await act("revoke", { delivery_id: first.delivery.id });
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.patient_report_sessions",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_report_code('browser-bound',$1,'correct','revoked') as ok",
          [first.delivery.id],
        )
      ).rows[0].ok,
      false,
    );
    await db.exec("set role anon");
    await assert.rejects(() =>
      db.query("select * from public.patient_report_approvals"),
    );
    await db.exec("reset role");
    await db.query(
      "select public.begin_patient_card_delete($1,$2,'Fictional report')",
      [owner, patient],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.patient_record_versions",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.patient_report_deliveries",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
