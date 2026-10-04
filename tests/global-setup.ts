import { request } from "@playwright/test";
import fs from "node:fs/promises";
export default async function setup() {
  const api = await request.newContext({ baseURL: "http://127.0.0.1:3100" });
  const email = "galadv73@gmail.com";
  const headers = { origin: "http://127.0.0.1:3100" };
  const sent = await api.post("/api/clinic/auth", {
    headers,
    data: { action: "request", email },
  });
  if (sent.status() !== 200) throw new Error("Owner OTP request failed");
  const outbox = await api.get(
    "http://127.0.0.1:3199/outbox?email=" + encodeURIComponent(email),
  );
  const mail = await outbox.json();
  const code = mail.at(-1).text.match(/\b\d{6}\b/)[0];
  const verified = await api.post("/api/clinic/auth", {
    headers,
    data: { action: "verify", email, code },
  });
  if (verified.status() !== 200)
    throw new Error("Owner OTP verification failed");
  await fs.mkdir("tmp", { recursive: true });
  await api.storageState({ path: "tmp/owner-auth.json" });
  await api.dispose();
}
