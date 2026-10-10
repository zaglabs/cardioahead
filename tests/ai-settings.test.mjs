import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
const load = (
  file,
  require = () => {
    throw new Error("Unexpected module");
  },
) => {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const fixtureModule = { exports: {} };
  new Function("module", "exports", "require", output)(
    fixtureModule,
    fixtureModule.exports,
    require,
  );
  return fixtureModule.exports;
};
const errors = load("src/lib/clinical/errors.ts");
const { readClaudeMessage } = load("src/lib/clinical/stream.ts", () => errors);
const { jobBudget } = load("src/lib/clinical/job-budget.ts");
const event = (e) => "data: " + JSON.stringify(e) + "\r\n\r\n";
const complete =
  event({ type: "message_start", message: { stop_reason: null } }) +
  event({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  }) +
  event({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: '{"he":"שלום","en":"hello"}' },
  }) +
  event({ type: "message_delta", delta: { stop_reason: "end_turn" } }) +
  event({ type: "message_stop" });
function streamed(text) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7)
          c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
test("Claude streams retain bilingual bytes, reject interrupted/error responses and respect the overall deadline", async () => {
  const result = await readClaudeMessage(streamed(complete));
  assert.equal(result.content[0].text, '{"he":"שלום","en":"hello"}');
  await assert.rejects(
    () =>
      readClaudeMessage(
        streamed(complete.slice(0, complete.lastIndexOf("data:"))),
      ),
    /AI_INCOMPLETE/,
  );
  await assert.rejects(
    () =>
      readClaudeMessage(
        streamed(event({ type: "error", error: { type: "overloaded_error" } })),
      ),
    /AI_PROVIDER_ERROR/,
  );
  const timeoutBody = new ReadableStream({
    start(c) {
      c.error(new DOMException("timeout", "TimeoutError"));
    },
  });
  await assert.rejects(
    () =>
      readClaudeMessage(
        new Response(timeoutBody, {
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    /AI_TIMEOUT/,
  );
  let elapsed = 0;
  const budget = jobBudget(0, () => elapsed);
  assert.equal(budget(135000), 135000);
  elapsed = 210000;
  assert.equal(budget(110000), 65000);
  elapsed = 275000;
  assert.throws(() => budget(110000), /JOB_EXPIRED/);
});
test("only the protected administrator can persist a model; settings are not publicly readable and never store keys", async () => {
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
      "202610100009_ai_settings.sql",
    ])
      await db.exec(
        fs.readFileSync(path.join("supabase/migrations", name), "utf8"),
      );
    const owner = (
      await db.query(
        "select id from public.clinic_staff where email='galadv73@gmail.com'",
      )
    ).rows[0].id;
    const staff = (
      await db.query(
        "insert into public.clinic_staff(id,email,role,status) values(gen_random_uuid(),'model-staff@example.test','professor','active') returning id",
      )
    ).rows[0].id;
    await assert.rejects(() =>
      db.query("select public.set_clinic_ai_model($1,'claude-sonnet-4-6')", [
        staff,
      ]),
    );
    await db.query(
      "select public.set_clinic_ai_model($1,'claude-sonnet-4-6')",
      [owner],
    );
    await assert.rejects(() =>
      db.query("select public.set_clinic_ai_model($1,'invalid / model')", [
        owner,
      ]),
    );
    assert.equal(
      (await db.query("select model_id from public.clinic_ai_settings")).rows[0]
        .model_id,
      "claude-sonnet-4-6",
    );
    await db.exec("set role anon");
    await assert.rejects(() =>
      db.query("select * from public.clinic_ai_settings"),
    );
    await db.exec("reset role");
    const columns = (
      await db.query(
        "select column_name from information_schema.columns where table_name='clinic_ai_settings'",
      )
    ).rows.map((r) => r.column_name);
    assert.ok(!columns.some((c) => /key|secret/.test(c)));
  } finally {
    await db.close();
  }
});

test("saved model read failures do not silently switch models; only a missing migration uses the environment default", async () => {
  let result = { data: null, error: { code: "PGRST205" } };
  const chain = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle() {
      return Promise.resolve(result);
    },
  };
  const settings = load("src/lib/clinical/settings.ts", (name) => {
    if (
      name === "server-only" ||
      name.includes("local-store") ||
      name.includes("security")
    )
      return {};
    if (name.includes("config")) return { localTestMode: () => false };
    if (name.includes("store"))
      return { supabaseAdmin: () => ({ from: () => chain }) };
    throw new Error("Unexpected dependency");
  });
  assert.equal(
    await settings.claudeModel(),
    process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
  );
  result = { data: null, error: { code: "TEMPORARY_FAILURE" } };
  await assert.rejects(() => settings.claudeModel(), /AI_SETTINGS_UNAVAILABLE/);
  result = { data: { model_id: "claude-haiku-4-5-20251001" }, error: null };
  assert.equal(await settings.claudeModel(), "claude-haiku-4-5-20251001");
});
