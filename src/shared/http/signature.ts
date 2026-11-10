import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 of the exact bytes, hex-encoded. */
export function sign(payload: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Serializes a body once and signs those bytes. Senders must send `raw`
 * as-is, so the receiver verifies exactly what was signed.
 */
export function signJson(body: unknown, secret: string): { raw: string; signature: string } {
  const raw = JSON.stringify(body);
  return { raw, signature: sign(raw, secret) };
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

/** Constant-time check of a hex signature against the raw request body. */
export function verify(signature: string | undefined, rawBody: string | Buffer, secret: string): boolean {
  if (!signature || !secret || !HEX_SHA256.test(signature)) return false;
  const expected = Buffer.from(sign(rawBody, secret), "hex");
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
