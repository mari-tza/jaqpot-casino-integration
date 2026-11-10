import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sign, signJson, verify } from "../../src/shared/http/signature";

const SECRET = "test-secret";
const body = { transactionId: "bet_1", amount: 500 };

describe("signature", () => {
  it("matches the reference implementation from the spec (HMAC-SHA256 of JSON.stringify, hex)", () => {
    const reference = createHmac("sha256", SECRET).update(JSON.stringify(body)).digest("hex");

    expect(signJson(body, SECRET).signature).toBe(reference);
  });

  it("verifies the exact bytes that were signed", () => {
    const { raw, signature } = signJson(body, SECRET);

    expect(verify(signature, raw, SECRET)).toBe(true);
    expect(verify(signature, Buffer.from(raw), SECRET)).toBe(true);
  });

  it("accepts any JSON formatting, as long as the signature covers those bytes", () => {
    const raw = '{ "amount": 500,\n  "transactionId": "bet_1" }';

    expect(verify(sign(raw, SECRET), raw, SECRET)).toBe(true);
  });

  it.each([
    ["a tampered body", signJson(body, SECRET).signature, JSON.stringify({ ...body, amount: 5000 }), SECRET],
    ["the wrong secret", signJson(body, "other-secret").signature, JSON.stringify(body), SECRET],
    ["a missing signature", undefined, JSON.stringify(body), SECRET],
    ["a non-hex signature", "z".repeat(64), JSON.stringify(body), SECRET],
    ["a truncated signature", signJson(body, SECRET).signature.slice(0, 32), JSON.stringify(body), SECRET],
    ["an empty secret", sign(JSON.stringify(body), ""), JSON.stringify(body), ""],
  ])("rejects %s", (_case, signature, raw, secret) => {
    expect(verify(signature, raw, secret)).toBe(false);
  });
});
