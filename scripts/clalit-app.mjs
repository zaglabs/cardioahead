delete process.env.DEBUG;
delete process.env.PWDEBUG;
const { createClalitCollector } =
  await import("./clalit-collector-runtime.mjs");
let app;
try {
  app = await createClalitCollector();
  await app.openHome();
} catch {
  // Do not print browser errors, URLs, credentials or medical content.
  console.error("COLLECTOR_START_FAILED");
  await app?.close();
  process.exitCode = 1;
}
process.once("SIGINT", () => void app?.close());
process.once("SIGTERM", () => void app?.close());
