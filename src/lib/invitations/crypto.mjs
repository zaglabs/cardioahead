import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
const key = (secret) =>
  createHash("sha256")
    .update("cardioahead-invitation-v1:" + secret)
    .digest();
export function sealInvitation(value, secret, binding) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(binding));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((x) => x.toString("base64url"))
    .join(".");
}
export function openInvitation(value, secret, binding) {
  const [iv, tag, body] = value
    .split(".")
    .map((x) => Buffer.from(x, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(binding));
  cipher.setAuthTag(tag);
  const packet = JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8"),
  );
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(packet.token) ||
    !/^[0-9]{6}$/.test(packet.code)
  )
    throw Error("INVALID_INVITATION_SECRET");
  return packet;
}
