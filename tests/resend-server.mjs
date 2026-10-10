import http from "node:http";
import { randomUUID } from "node:crypto";
const mail = [];
const failures = new Set();
http
  .createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const url = new URL(req.url, "http://127.0.0.1:3199");
    if (req.method === "GET" && url.pathname === "/outbox") {
      return res.end(
        JSON.stringify(
          mail.filter(
            (m) =>
              !url.searchParams.get("email") ||
              m.to.includes(url.searchParams.get("email")),
          ),
        ),
      );
    }
    if (req.method === "GET" && url.pathname.startsWith("/emails/")) {
      const message = mail.find((m) => m.id === url.pathname.split("/").at(-1));
      if (!message) {
        res.statusCode = 404;
        return res.end("{}");
      }
      return res.end(
        JSON.stringify({ id: message.id, last_event: "delivered" }),
      );
    }
    if (req.method === "POST" && url.pathname === "/emails") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const message = JSON.parse(body);
      if (
        req.headers.authorization !== "Bearer local-resend-test-key" ||
        !req.headers["idempotency-key"]
      ) {
        res.statusCode = 401;
        return res.end("{}");
      }
      if (
        message.to[0].startsWith("retry-once") &&
        !failures.has(message.to[0])
      ) {
        failures.add(message.to[0]);
        res.statusCode = 503;
        return res.end("{}");
      }
      if (message.to[0].startsWith("delivery-failure")) {
        res.statusCode = 503;
        return res.end("{}");
      }
      const existing = mail.find(
        (m) => m.key === req.headers["idempotency-key"],
      );
      if (existing) {
        if (
          JSON.stringify({
            from: existing.from,
            to: existing.to,
            subject: existing.subject,
            text: existing.text,
          }) !== JSON.stringify(message)
        ) {
          res.statusCode = 409;
          return res.end("{}");
        }
        return res.end(JSON.stringify({ id: existing.id }));
      }
      const entry = {
        ...message,
        id: randomUUID(),
        key: req.headers["idempotency-key"],
      };
      mail.push(entry);
      return res.end(JSON.stringify({ id: entry.id }));
    }
    res.statusCode = 404;
    res.end("{}");
  })
  .listen(3199, "127.0.0.1");
