import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { casinoPost, openSession, resetCasino, userId } from "../helpers/casino";

afterEach(resetCasino);

describe("POST /casino/getBalance", () => {
  it("returns the wallet balance as a string, in cents", async () => {
    const s = await openSession("alice");

    const res = await casinoPost("/getBalance", { sessionToken: s.token, userId: s.userId, currency: "USD" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: "100000", currency: "USD" });
  });

  it("does not write anything", async () => {
    const s = await openSession("alice");

    await casinoPost("/getBalance", { sessionToken: s.token, userId: s.userId, currency: "USD" });

    expect(await prisma.casinoTransaction.count()).toBe(0);
  });

  it("rejects an unknown session token", async () => {
    const res = await casinoPost("/getBalance", { sessionToken: "nope", userId: 1, currency: "USD" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("SESSION_NOT_FOUND");
  });

  it("rejects an inactive session", async () => {
    const s = await openSession("alice", { isActive: false });

    const res = await casinoPost("/getBalance", { sessionToken: s.token, userId: s.userId, currency: "USD" });

    expect(res.status).toBe(404);
  });

  it("rejects a userId that does not own the session", async () => {
    const s = await openSession("alice");

    const res = await casinoPost("/getBalance", {
      sessionToken: s.token,
      userId: await userId("bob"),
      currency: "USD",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("SESSION_USER_MISMATCH");
  });

  it("rejects a currency other than the wallet's", async () => {
    const s = await openSession("alice");

    const res = await casinoPost("/getBalance", { sessionToken: s.token, userId: s.userId, currency: "EUR" });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("CURRENCY_MISMATCH");
  });

  it("rejects an invalid body", async () => {
    const res = await casinoPost("/getBalance", { sessionToken: "x", userId: "1", currency: "usd" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});
