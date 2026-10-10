import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  sealInvitation,
  openInvitation,
} from "../src/lib/invitations/crypto.mjs";
test("recoverable invitation secrets are encrypted and cryptographically bound to their invitation and card", () => {
  const value = {
      token: randomBytes(32).toString("base64url"),
      code: "001234",
    },
    secret = "fixture-secret-".repeat(5),
    binding = "fictional-invitation:fictional-card:hash";
  const ciphertext = sealInvitation(value, secret, binding);
  assert.ok(!ciphertext.includes(value.token));
  assert.ok(!ciphertext.includes(value.code));
  assert.deepEqual(openInvitation(ciphertext, secret, binding), value);
  assert.throws(() => openInvitation(ciphertext, secret, binding + "-other"));
  assert.throws(() => openInvitation(ciphertext, secret + "-other", binding));
  const parts = ciphertext.split(".");
  const changed = Buffer.from(parts[2], "base64url");
  changed[0] ^= 1;
  parts[2] = changed.toString("base64url");
  assert.throws(() => openInvitation(parts.join("."), secret, binding));
});
