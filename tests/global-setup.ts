import { request } from "@playwright/test";
import fs from "node:fs/promises";
export default async function setup() {
  await fs.mkdir("tmp", { recursive: true });
  for (const [port, filename] of [
    [3100, "owner-auth.json"],
    [3120, "claude-owner-auth.json"],
  ] as const) {
    const base = "http://127.0.0.1:" + port,
      api = await request.newContext({ baseURL: base });
    const email = "galadv73@gmail.com",
      headers = { origin: base };
    const sent = await api.post("/api/clinic/auth", {
      headers,
      data: { action: "request", email },
    });
    if (sent.status() !== 200) throw new Error("Owner OTP request failed");
    const box = await api.get(
      "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
    );
    const code = (await box.json()).at(-1).text.match(/\b\d{6}\b/)[0];
    const verified = await api.post("/api/clinic/auth", {
      headers,
      data: { action: "verify", email, code },
    });
    if (verified.status() !== 200)
      throw new Error("Owner OTP verification failed");
    await api.storageState({ path: "tmp/" + filename });
    await api.dispose();
  }
}
