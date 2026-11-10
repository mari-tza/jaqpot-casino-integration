import express from "express";
import pino from "pino";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requestContext } from "../../src/shared/http/requestContext";

/** App with a logger that writes JSON lines into an array. */
function appWithCapturedLogs() {
  const lines: Record<string, unknown>[] = [];
  const logger = pino({ level: "info" }, { write: (line: string) => lines.push(JSON.parse(line)) });
  const app = express();
  app.use(requestContext(logger));
  app.get("/echo", (req, res) => res.json({ requestId: req.requestId }));
  return { app, lines };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("request context", () => {
  it("generates a request id and returns it in the response header", async () => {
    const { app } = appWithCapturedLogs();

    const res = await request(app).get("/echo");

    expect(res.headers["x-request-id"]).toMatch(UUID);
    expect(res.body.requestId).toBe(res.headers["x-request-id"]);
  });

  it("reuses a well-formed incoming x-request-id", async () => {
    const { app } = appWithCapturedLogs();

    const res = await request(app).get("/echo").set("x-request-id", "abc-123");

    expect(res.headers["x-request-id"]).toBe("abc-123");
  });

  it("replaces an incoming id that could pollute the logs", async () => {
    const { app } = appWithCapturedLogs();

    const res = await request(app).get("/echo").set("x-request-id", "bad id\twith spaces");

    expect(res.headers["x-request-id"]).toMatch(UUID);
  });

  it("logs one line per request with id, status and duration", async () => {
    const { app, lines } = appWithCapturedLogs();

    await request(app).get("/echo").set("x-request-id", "trace-1");

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      requestId: "trace-1",
      method: "GET",
      path: "/echo",
      status: 200,
      msg: "request completed",
    });
    expect(lines[0]?.durationMs).toEqual(expect.any(Number));
  });
});
