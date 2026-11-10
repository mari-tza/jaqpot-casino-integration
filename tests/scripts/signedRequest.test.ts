import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { signedRequest } from "../../scripts/lib/signedRequest";
import { createApp } from "../../src/app";
import { config } from "../../src/shared/config";
import { verify } from "../../src/shared/http/signature";
import { openSession, resetCasino } from "../helpers/casino";

afterEach(resetCasino);

describe("signedRequest (npm run call)", () => {
  it("signs casino calls in a way the casino accepts", async () => {
    const s = await openSession("alice");
    const { raw, headers } = signedRequest("/casino/getBalance", {
      sessionToken: s.token,
      userId: s.userId,
      currency: "USD",
    });

    const res = await request(createApp()).post("/casino/getBalance").set(headers).send(raw);

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe("100000");
  });

  it("signs provider calls with the provider secret and header", () => {
    const { raw, headers } = signedRequest("/provider/launch", { a: 1 });

    expect(headers).not.toHaveProperty("x-casino-signature");
    expect(verify(headers["x-provider-signature"], Buffer.from(raw), config().PROVIDER_SECRET)).toBe(true);
  });

  it("rejects a path outside both systems", () => {
    expect(() => signedRequest("/health", {})).toThrow("Path must start with /casino/ or /provider/");
  });

  it("needs the secret", () => {
    expect(() => signedRequest("/casino/debit", {}, {})).toThrow("CASINO_SECRET is not set");
  });
});
