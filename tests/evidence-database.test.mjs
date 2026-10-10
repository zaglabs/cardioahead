import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
test("evidence review migration protects clinician access, deduplicates jobs, retains history and purges deleted cards", async () => {
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
    ).rows[0].id;
    const doctor = randomUUID(),
      secretary = randomUUID(),
      card = randomUUID();
    await db.query(
      "insert into public.clinic_staff(id,email,role,status) values($1,'doctor@fictional.test','professor','active'),($2,'secretary@fictional.test','secretary','active')",
      [doctor, secretary],
    );
    await db.query(
      "insert into public.appointments(id,patient_label,token_hash,pin_digest,expires_at,created_by) values($1,'fictional evidence','token','pin',now()+interval '7 days',$2)",
      [card, doctor],
    );
    await assert.rejects(() =>
      db.query(
        "select public.queue_evidence_review($1,$2,'v1','','question',false)",
        [secretary, card],
      ),
    );
    const queue = async (actor, version, regenerate = false) =>
      (
        await db.query(
          "select public.queue_evidence_review($1,$2,$3,'','question',$4) as result",
          [actor, card, version, regenerate],
        )
      ).rows[0].result;
    const first = await queue(doctor, "v1");
    assert.equal(first.started, true);
    const same = await queue(owner, "v1");
    assert.equal(same.started, false);
    assert.equal(same.record.id, first.record.id);
    await db.query(
      "update public.clinical_evidence_reviews set status='ready',stage='complete',completed_at=now(),created_at=now()-interval '1 minute',report='{}' where id=$1",
      [first.record.id],
    );
    assert.equal((await queue(doctor, "v1")).started, false);
    const second = await queue(doctor, "v2");
    assert.equal(second.started, true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.clinical_evidence_reviews",
        )
      ).rows[0].n,
      2,
    );
    await db.query(
      "select public.delete_clinic_staff($1,$2,'doctor@fictional.test')",
      [owner, doctor],
    );
    assert.equal(
      (
        await db.query(
          "select created_by from public.clinical_evidence_reviews limit 1",
        )
      ).rows[0].created_by,
      null,
    );
    await db.exec("set role anon");
    await assert.rejects(() =>
      db.query("select * from public.clinical_evidence_reviews"),
    );
    await db.exec("reset role;set role authenticated");
    await assert.rejects(() =>
      db.query(
        "select public.queue_evidence_review($1,$2,'v3','','question',false)",
        [owner, card],
      ),
    );
    await db.exec("reset role");
    await db.query(
      "select public.begin_patient_card_delete($1,$2,'fictional evidence')",
      [owner, card],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.clinical_evidence_reviews",
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(() => queue(owner, "v3"));
  } finally {
    await db.close();
  }
});
