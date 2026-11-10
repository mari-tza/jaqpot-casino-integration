import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../../src/app";
import { AppError } from "../../src/shared/errors/AppError";
import { errorHandler, notFoundHandler } from "../../src/shared/errors/errorHandler";

function appThatThrows() {
  const app = express();
  app.use(express.json());
  app.post("/app-error", () => {
    throw new AppError(409, "SOMETHING_CONFLICTS", "Conflict", { id: 1 });
  });
  app.post("/validation", (req) => {
    z.object({ amount: z.number() }).parse(req.body);
  });
  app.post("/boom", () => {
    throw new Error("database password is hunter2");
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("error responses", () => {
  it("maps an AppError to its status and code", async () => {
    const res = await request(appThatThrows()).post("/app-error");

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "SOMETHING_CONFLICTS", message: "Conflict", details: { id: 1 } });
  });

  it("maps a schema failure to 400 VALIDATION_ERROR with the issues", async () => {
    const res = await request(appThatThrows()).post("/validation").send({ amount: "ten" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
    expect(res.body.details[0].path).toEqual(["amount"]);
  });

  it("maps malformed JSON to 400 INVALID_JSON", async () => {
    const res = await request(appThatThrows())
      .post("/validation")
      .set("content-type", "application/json")
      .send("{ not json");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("hides the message of unexpected errors", async () => {
    const res = await request(appThatThrows()).post("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: "INTERNAL_ERROR", message: "Unexpected error" });
  });

  it("returns JSON 404 for unknown routes on the real app", async () => {
    const res = await request(createApp()).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("NOT_FOUND");
  });
});
