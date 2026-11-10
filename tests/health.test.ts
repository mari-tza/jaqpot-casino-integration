import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/shared/db/prisma";

describe("GET /health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the database as up", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });

  it("returns 503 when the database cannot be reached", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "degraded", database: "down" });
  });
});
