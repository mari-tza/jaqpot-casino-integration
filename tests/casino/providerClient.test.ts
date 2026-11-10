import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callProvider } from "../../src/casino/providerClient";
import { jsonBody } from "../../src/shared/http/jsonBody";
import { verify } from "../../src/shared/http/signature";

const SECRET = "stub-provider-secret";
const seen: { signatureValid?: boolean; requestId?: string } = {};
let server: Server;
let endpoint: string;

/** Stub provider: echoes, fails or hangs depending on the path. */
beforeAll(async () => {
  const app = express();
  app.use(jsonBody());
  app.post("/ok", (req, res) => {
    seen.signatureValid = verify(req.header("x-provider-signature"), req.rawBody!, SECRET);
    seen.requestId = req.header("x-request-id");
    res.json({ echo: req.body });
  });
  app.post("/refuse", (_req, res) => res.status(404).json({ error: "GAME_NOT_FOUND", message: "nope" }));
  app.post("/hang", () => {});
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("callProvider", () => {
  it("sends a body the provider can verify, and forwards the request id", async () => {
    const data = await callProvider(
      { apiEndpoint: endpoint, secret: SECRET },
      "/ok",
      { a: 1 },
      { requestId: "trace-1" },
    );

    expect(data).toEqual({ echo: { a: 1 } });
    expect(seen).toEqual({ signatureValid: true, requestId: "trace-1" });
  });

  it("turns a provider error into 502 with the provider's code", async () => {
    await expect(callProvider({ apiEndpoint: endpoint, secret: SECRET }, "/refuse", {})).rejects.toMatchObject({
      status: 502,
      code: "PROVIDER_ERROR",
      details: { status: 404, error: "GAME_NOT_FOUND" },
    });
  });

  it("gives up after the timeout", async () => {
    await expect(
      callProvider({ apiEndpoint: endpoint, secret: SECRET }, "/hang", {}, { timeoutMs: 200 }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR", message: "Provider /hang timed out" });
  });

  it("reports an unreachable provider", async () => {
    await expect(callProvider({ apiEndpoint: "http://127.0.0.1:1", secret: SECRET }, "/ok", {})).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Provider /ok unreachable",
    });
  });
});
