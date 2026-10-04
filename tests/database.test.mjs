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
    const staff = randomUUID(),
      id = randomUUID(),
      locked = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [staff]);
    await db.query(
      "insert into public.clinic_staff values($1,'tester@example.com','admin')",
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
