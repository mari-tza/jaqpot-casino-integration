import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CasinoRejection, callCasino, type CasinoTarget } from "../../src/provider/casinoClient";
import { jsonBody } from "../../src/shared/http/jsonBody";
import { verify } from "../../src/shared/http/signature";

const SECRET = "stub-casino-secret";
let received: { raw: string; signature?: string; requestId?: string }[] = [];
let server: Server;
let casino: CasinoTarget;

/** Stub casino: each path fails in a different way before answering. */
beforeAll(async () => {
  const app = express();
  app.use(jsonBody());
  app.use((req, _res, next) => {
    received.push({
      raw: req.rawBody!.toString(),
      signature: req.header("x-casino-signature"),
      requestId: req.header("x-request-id"),
    });
    next();
  });
  const nth = () => received.length;
  app.post("/ok", (req, res) => res.json({ valid: verify(req.header("x-casino-signature"), req.rawBody!, SECRET) }));
  app.post("/busy-once", (_req, res) => (nth() === 1 ? res.status(503).end() : res.json({ ok: true })));
  app.post("/drop-once", (req, res) => (nth() === 1 ? req.socket.destroy() : res.json({ ok: true })));
  app.post("/refuse", (_req, res) => res.status(422).json({ error: "INSUFFICIENT_FUNDS", message: "no" }));
  app.post("/down", (_req, res) => res.status(500).end());
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  casino = { casinoApiEndpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, casinoSecret: SECRET };
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  received = [];
});

const fast = { backoffMs: 1 };

describe("callCasino", () => {
  it("sends a body the casino can verify, and forwards the request id", async () => {
    const data = await callCasino(casino, "/ok", { transactionId: "t1" }, { requestId: "trace-1" });

    expect(data).toEqual({ valid: true });
    expect(received[0]?.requestId).toBe("trace-1");
  });

  it.each(["/busy-once", "/drop-once"])("retries %s with the same bytes and signature", async (path) => {
    const data = await callCasino(casino, path, { transactionId: "t1", amount: 500 }, fast);

    expect(data).toEqual({ ok: true });
    expect(received).toHaveLength(2);
    expect(received[1]).toEqual(received[0]);
  });

  it("does not retry a rejection", async () => {
    const call = callCasino(casino, "/refuse", {}, fast);

    await expect(call).rejects.toBeInstanceOf(CasinoRejection);
    await expect(call).rejects.toMatchObject({ status: 422, body: { error: "INSUFFICIENT_FUNDS" } });
    expect(received).toHaveLength(1);
  });

  it("gives up after the retries", async () => {
    await expect(callCasino(casino, "/down", {}, { ...fast, retries: 2 })).rejects.toMatchObject({
      status: 502,
      code: "CASINO_UNAVAILABLE",
      message: "Casino /down failed with 500 after 3 attempts",
    });
    expect(received).toHaveLength(3);
  });

  it("reports an unreachable casino", async () => {
    const target = { ...casino, casinoApiEndpoint: "http://127.0.0.1:1" };

    await expect(callCasino(target, "/ok", {}, fast)).rejects.toMatchObject({
      code: "CASINO_UNAVAILABLE",
      message: "Casino /ok unreachable after 3 attempts",
    });
  });
});
