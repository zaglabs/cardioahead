import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
test("private PostgreSQL schema enforces scoped sessions, PIN lockout, submission and revocation", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    await db.exec(
      fs.readFileSync(
        path.join(process.cwd(), "supabase/migrations/202610040001_portal.sql"),
        "utf8",
      ),
    );
    await db.exec(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "supabase/migrations/202610040002_staff_otp.sql",
        ),
        "utf8",
      ),
    );
    const staff = randomUUID(),
      id = randomUUID(),
      locked = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [staff]);
    await db.query(
      "insert into public.clinic_staff(id,email,role,status) values($1,'tester@example.com','secretary','active')",
      [staff],
    );
    const create = async (id, token) =>
      db.query(
        "insert into public.appointments(id,patient_label,token_hash,pin_digest,expires_at,created_by) values($1,'synthetic',$2,'correct',now()+interval '7 days',$3)",
        [id, token, staff],
      );
    await create(id, "token");
    await create(locked, "locked");
    for (let i = 0; i < 5; i++) {
      const r = await db.query(
        "select public.verify_patient_pin('locked','wrong',$1) as ok",
        ["failed-" + i],
      );
      assert.equal(r.rows[0].ok, false);
    }
    assert.equal(
      (
        await db.query(
          "select public.verify_patient_pin('locked','correct','blocked') as ok",
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_patient_pin('token','correct','patient-session') as ok",
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select appointment_id from public.portal_sessions where session_hash='patient-session'",
        )
      ).rows[0].appointment_id,
      id,
    );
    assert.equal(
      (await db.query("select public.submit_appointment($1) as ok", [id]))
        .rows[0].ok,
      false,
    );
    const doc = {
      id: randomUUID(),
      appointment_id: id,
      filename: "synthetic.pdf",
      storage_path: id + "/fixture.pdf",
      sha256: "fixture-hash",
      bytes: 1000,
      created_at: new Date().toISOString(),
    };
    await db.query("select public.attach_document($1::jsonb)", [
      JSON.stringify(doc),
    ]);
    await assert.rejects(() =>
      db.query("select public.attach_document($1::jsonb)", [
        JSON.stringify({
          ...doc,
          id: randomUUID(),
          storage_path: id + "/duplicate.pdf",
        }),
      ]),
    );
    assert.equal(
      (await db.query("select public.submit_appointment($1) as ok", [id]))
        .rows[0].ok,
      true,
    );
    await assert.rejects(() =>
      db.query("select public.attach_document($1::jsonb)", [
        JSON.stringify({
          ...doc,
          id: randomUUID(),
          sha256: "second",
          storage_path: id + "/second.pdf",
        }),
      ]),
    );
    await db.query("select public.revoke_invitation($1)", [id]);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from public.portal_sessions where appointment_id=$1",
          [id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_patient_pin('token','correct','revoked') as ok",
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (await db.query("select public from storage.buckets")).rows[0].public,
      false,
    );
    const rls = await db.query(
      "select relname,relrowsecurity from pg_class where relname in ('appointments','documents','clinic_staff','portal_sessions','audit_events')",
    );
    assert.equal(rls.rows.length, 5);
    assert.ok(rls.rows.every((r) => r.relrowsecurity));
    await db.exec("set role anon");
    await assert.rejects(() => db.query("select * from public.documents"));
    await assert.rejects(() =>
      db.query("select public.verify_patient_pin('token','correct','anon')"),
    );
    await db.exec("reset role");
    const expired = randomUUID();
    await create(expired, "expired");
    await db.query(
      "update public.appointments set expires_at=now()-interval '1 minute' where id=$1",
      [expired],
    );
    assert.equal(
      (
        await db.query(
          "select public.verify_patient_pin('expired','correct','too-late') as ok",
        )
      ).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});

test("staff OTP and approvals enforce expiry, single use, lockout, limits and sole-owner protection", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202610040001_portal.sql",
      "202610040002_staff_otp.sql",
    ])
      await db.exec(
        fs.readFileSync(
          path.join(process.cwd(), "supabase/migrations", name),
          "utf8",
        ),
      );
    const owner = (
      await db.query(
        "select * from public.clinic_staff where email='galadv73@gmail.com'",
      )
    ).rows[0];
    assert.equal(owner.role, "admin");
    assert.equal(owner.status, "active");
    await assert.rejects(() =>
      db.query("update public.clinic_staff set role='secretary' where id=$1", [
        owner.id,
      ]),
    );
    await assert.rejects(() =>
      db.query("delete from public.clinic_staff where id=$1", [owner.id]),
    );
    await assert.rejects(() =>
      db.query(
        "insert into public.clinic_staff(id,email,role,status) values($1,'evil@example.com','admin','active')",
        [randomUUID()],
      ),
    );
    const reserve = async (id, email = "staff@example.com", ip = "ip") =>
      (
        await db.query("select public.reserve_staff_otp($1::jsonb) as ok", [
          JSON.stringify({
            id,
            email,
            ip_hash: ip,
            code_digest: "hashed-code",
          }),
        ])
      ).rows[0].ok;
    const deliver = async (id) =>
      db.query("select public.staff_otp_delivery($1,true)", [id]);
    const verify = async (id, email, digest, session) =>
      (
        await db.query("select public.verify_staff_otp($1,$2,$3,$4) as staff", [
          id,
          email,
          digest,
          session,
        ])
      ).rows[0].staff;
    assert.equal(await reserve("first"), true);
    assert.equal(await reserve("too-soon"), false);
    assert.equal(
      await verify("first", "staff@example.com", "hashed-code", "undelivered"),
      null,
    );
    await deliver("first");
    assert.equal(
      await verify(
        "first",
        "different@example.com",
        "hashed-code",
        "wrong-email",
      ),
      null,
    );
    const staff = await verify(
      "first",
      "staff@example.com",
      "hashed-code",
      "pending-session",
    );
    assert.equal(staff.status, "pending");
    assert.equal(staff.role, "secretary");
    assert.equal(
      await verify("first", "staff@example.com", "hashed-code", "replay"),
      null,
    );
    const manage = async (actor, status, role = "professor") =>
      (
        await db.query("select public.manage_clinic_staff($1,$2,$3,$4) as ok", [
          actor,
          staff.id,
          status,
          role,
        ])
      ).rows[0].ok;
    assert.equal(await manage(staff.id, "active"), false);
    assert.equal(await manage(owner.id, "active", "admin"), false);
    assert.equal(await manage(owner.id, "active"), true);
    assert.equal(await manage(owner.id, "suspended"), true);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.portal_sessions where staff_id=$1",
          [staff.id],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      await reserve("suspended", "staff@example.com", "new-ip"),
      false,
    );
    await db.query(
      "update public.staff_otp_challenges set created_at=now()-interval '2 minutes'",
    );
    assert.equal(await reserve("suspended", "staff@example.com"), true);
    await deliver("suspended");
    assert.equal(
      await verify(
        "suspended",
        "staff@example.com",
        "hashed-code",
        "suspended-session",
      ),
      null,
    );
    assert.equal(await reserve("locked", "locked@example.com"), true);
    await deliver("locked");
    for (let i = 0; i < 5; i++)
      assert.equal(
        await verify("locked", "locked@example.com", "wrong", "failed-" + i),
        null,
      );
    assert.equal(
      await verify(
        "locked",
        "locked@example.com",
        "hashed-code",
        "correct-after-lock",
      ),
      null,
    );
    assert.equal(await reserve("expired", "expired@example.com"), true);
    await deliver("expired");
    await db.query(
      "update public.staff_otp_challenges set expires_at=now()-interval '1 minute' where id='expired'",
    );
    assert.equal(
      await verify(
        "expired",
        "expired@example.com",
        "hashed-code",
        "expired-session",
      ),
      null,
    );
    assert.equal(await reserve("owner", "galadv73@gmail.com"), true);
    await deliver("owner");
    assert.equal(
      (
        await verify(
          "owner",
          "galadv73@gmail.com",
          "hashed-code",
          "owner-session",
        )
      ).role,
      "admin",
    );
    assert.equal(await reserve("race", "race@example.com"), true);
    await deliver("race");
    const results = await Promise.all([
      verify("race", "race@example.com", "hashed-code", "race-1"),
      verify("race", "race@example.com", "hashed-code", "race-2"),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    for (let i = 0; i < 5; i++) {
      await db.query(
        "update public.staff_otp_challenges set created_at=now()-interval '2 minutes' where email='limited@example.com'",
      );
      assert.equal(
        await reserve("limited-" + i, "limited@example.com", "limit-ip"),
        true,
      );
    }
    await db.query(
      "update public.staff_otp_challenges set created_at=now()-interval '2 minutes' where email='limited@example.com'",
    );
    assert.equal(
      await reserve("sixth", "limited@example.com", "limit-ip"),
      false,
    );
    for (let i = 0; i < 30; i++)
      assert.equal(
        await reserve("ip-" + i, "person" + i + "@example.com", "shared-ip"),
        true,
      );
    assert.equal(
      await reserve("ip-limit", "extra@example.com", "shared-ip"),
      false,
    );
    assert.equal(
      (
        await db.query(
          "select relrowsecurity from pg_class where relname='staff_otp_challenges'",
        )
      ).rows[0].relrowsecurity,
      true,
    );
    await db.exec("set role anon");
    await assert.rejects(() =>
      db.query("select * from public.staff_otp_challenges"),
    );
    await assert.rejects(() =>
      db.query(
        "select public.verify_staff_otp('first','staff@example.com','hashed-code','anon')",
      ),
    );
    await assert.rejects(() =>
      db.query(
        "select public.manage_clinic_staff($1,$2,'active','professor')",
        [owner.id, staff.id],
      ),
    );
  } finally {
    await db.close();
  }
});

test("clinical records serialize analysis and presentation creation and reject non-clinician access", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    for (const name of [
      "202610040001_portal.sql",
      "202610040002_staff_otp.sql",
      "202610090003_clinical_records.sql",
    ])
      await db.exec(
        fs.readFileSync(
          path.join(process.cwd(), "supabase/migrations", name),
          "utf8",
        ),
      );
    const owner = (
      await db.query("select id from public.clinic_staff where role='admin'")
    ).rows[0].id;
    const secretary = randomUUID(),
      appointment = randomUUID(),
      token = randomUUID(),
      stale = randomUUID();
    await db.query(
      "insert into public.clinic_staff(id,email,role,status) values($1,'secretary@example.test','secretary','active')",
      [secretary],
    );
    await db.query(
      "insert into public.appointments(id,patient_label,token_hash,pin_digest,expires_at,created_by) values($1,'fictional','clinical-token','pin',now()+interval '7 days',$2)",
      [appointment, owner],
    );
    assert.equal(
      (
        await db.query(
          "select public.claim_visit_analysis($1,'h','[]',$2) ok",
          [appointment, token],
        )
      ).rows[0].ok,
      false,
    );
    await db.query(
      "update public.appointments set status='submitted' where id=$1",
      [appointment],
    );
    await db.query("select public.queue_visit_analysis($1)", [appointment]);
    assert.equal(
      (
        await db.query(
          "select public.claim_visit_analysis($1,'h','[]',$2) ok",
          [appointment, token],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select public.claim_visit_analysis($1,'h','[]',$2) ok",
          [appointment, stale],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select public.finish_visit_analysis($1,$2,$3,'[]','test-model') ok",
          [
            appointment,
            stale,
            JSON.stringify({ presentation: { eligible: true } }),
          ],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select public.finish_visit_analysis($1,$2,$3,'[]','test-model') ok",
          [
            appointment,
            token,
            JSON.stringify({ presentation: { eligible: true } }),
          ],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("select count(*)::int n from public.visit_presentations"))
        .rows[0].n,
      0,
    );
    await assert.rejects(() =>
      db.query("select public.save_visit_presentation($1,$2,'{}')", [
        appointment,
        secretary,
      ]),
    );
    const first = (
      await db.query(
        "select public.save_visit_presentation($1,$2,'{}') result",
        [appointment, owner],
      )
    ).rows[0].result;
    const second = (
      await db.query(
        "select public.save_visit_presentation($1,$2,'{}') result",
        [appointment, owner],
      )
    ).rows[0].result;
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.record.id, second.record.id);
    assert.equal(
      (await db.query("select count(*)::int n from public.visit_presentations"))
        .rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select public.review_visit_artifact($1,$2,'summary') ok",
          [appointment, secretary],
        )
      ).rows[0].ok,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select public.review_visit_artifact($1,$2,'summary') ok",
          [appointment, owner],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select public.review_visit_artifact($1,$2,'presentation') ok",
          [appointment, owner],
        )
      ).rows[0].ok,
      true,
    );
    await db.exec("set role anon");
    await assert.rejects(() => db.query("select * from public.visit_analysis"));
    await assert.rejects(() =>
      db.query("select * from public.visit_presentations"),
    );
    await assert.rejects(() =>
      db.query("select public.queue_visit_analysis($1)", [appointment]),
    );
  } finally {
    await db.close();
  }
});
