import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../../src/shared/config";
import { errorHandler } from "../../src/shared/errors/errorHandler";
import { jsonBody } from "../../src/shared/http/jsonBody";
import { requireCasinoSignature, requireProviderSignature } from "../../src/shared/http/requireSignature";
import { sign, signJson } from "../../src/shared/http/signature";

const { CASINO_SECRET, PROVIDER_SECRET } = config();

function app() {
  const a = express();
  a.use(jsonBody());
  a.post("/casino/callback", requireCasinoSignature, (_req, res) => res.json({ ok: true }));
  a.post("/provider/call", requireProviderSignature, (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

function post(path: string, raw: string, headers: Record<string, string>) {
  return request(app()).post(path).set("content-type", "application/json").set(headers).send(raw);
}

const body = { sessionToken: "t", userId: 1, currency: "USD" };

describe("signature middleware", () => {
  it("lets a correctly signed callback through", async () => {
    const { raw, signature } = signJson(body, CASINO_SECRET);

    const res = await post("/casino/callback", raw, { "x-casino-signature": signature });

    expect(res.status).toBe(200);
  });

  it("checks the raw bytes, so any JSON formatting works when signed exactly", async () => {
    const raw = '{\n  "userId": 1, "currency": "USD", "sessionToken": "t"\n}';

    const res = await post("/casino/callback", raw, { "x-casino-signature": sign(raw, CASINO_SECRET) });

    expect(res.status).toBe(200);
  });

  it.each([
    ["no signature", () => ({ raw: JSON.stringify(body), headers: {} })],
    [
      "a body changed after signing",
      () => ({
        raw: JSON.stringify({ ...body, userId: 2 }),
        headers: { "x-casino-signature": signJson(body, CASINO_SECRET).signature },
      }),
    ],
    [
      "the other direction's secret",
      () => {
        const { raw, signature } = signJson(body, PROVIDER_SECRET);
        return { raw, headers: { "x-casino-signature": signature } };
      },
    ],
    [
      "the other direction's header",
      () => {
        const { raw, signature } = signJson(body, CASINO_SECRET);
        return { raw, headers: { "x-provider-signature": signature } };
      },
    ],
  ])("rejects a callback with %s", async (_case, build) => {
    const { raw, headers } = build();

    const res = await post("/casino/callback", raw, headers);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("INVALID_SIGNATURE");
  });

  it("uses x-provider-signature and PROVIDER_SECRET for calls to the provider", async () => {
    const { raw, signature } = signJson(body, PROVIDER_SECRET);

    expect((await post("/provider/call", raw, { "x-provider-signature": signature })).status).toBe(200);
    expect((await post("/provider/call", raw, { "x-casino-signature": signature })).status).toBe(401);
  });
});
