delete process.env.DEBUG;
delete process.env.PWDEBUG;
const { createRemotePilotServer } = await import("./clalit-remote-server.mjs");
let app;
try {
  app = await createRemotePilotServer();
  // The capability is shown only to the owner launching this private local pilot.
  console.log("PRIVATE_TEST_URL " + app.url);
  console.log("WAITING_FOR_BROWSERBASE_SETUP — no hosted session, uploads or AI calls have started.");
} catch { console.error("REMOTE_PILOT_START_FAILED"); process.exitCode = 1; }
process.once("SIGINT", () => void app?.close());
process.once("SIGTERM", () => void app?.close());