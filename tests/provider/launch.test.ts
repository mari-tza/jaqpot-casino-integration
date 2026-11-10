import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { providerPost, resetProvider } from "../helpers/provider";

afterEach(resetProvider);

const launchBody = (overrides: Record<string, unknown> = {}) => ({
  sessionToken: randomUUID(),
  userId: 1,
  gameId: "slots-777",
  currency: "USD",
  casinoCode: "HOUSE",
  ...overrides,
});

describe("POST /provider/launch", () => {
  it("creates a provider session and returns the game url", async () => {
    const body = launchBody();

    const res = await providerPost("/launch", body);

    expect(res.status).toBe(200);
    expect(res.body.providerSessionId).toMatch(/^psess_/);
    expect(res.body.gameUrl).toContain(`slots-777?session=${res.body.providerSessionId}`);
    const session = await prisma.providerGameSession.findUniqueOrThrow({
      where: { providerSessionId: res.body.providerSessionId },
      include: { customer: true },
    });
    expect(session).toMatchObject({ casinoSessionToken: body.sessionToken, currency: "USD" });
    expect(session.customer.externalUserId).toBe("1");
  });

  it("reuses the customer across sessions", async () => {
    await providerPost("/launch", launchBody());
    await providerPost("/launch", launchBody());

    expect(await prisma.providerCustomer.count()).toBe(1);
    expect(await prisma.providerGameSession.count()).toBe(2);
  });

  it("returns the same session when the casino repeats a launch", async () => {
    const body = launchBody();

    const first = await providerPost("/launch", body);
    const retry = await providerPost("/launch", body);

    expect(retry.body).toEqual(first.body);
    expect(await prisma.providerGameSession.count()).toBe(1);
  });

  it("creates the customer once when a new player launches twice at the same time", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => providerPost("/launch", launchBody())));

    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.providerCustomer.count()).toBe(1);
    expect(await prisma.providerGameSession.count()).toBe(5);
  });

  it("returns one session when the same launch arrives twice at the same time", async () => {
    await providerPost("/launch", launchBody()); // customer exists, only the session races
    const body = launchBody();

    const results = await Promise.all(Array.from({ length: 10 }, () => providerPost("/launch", body)));

    expect(new Set(results.map((r) => r.status))).toEqual(new Set([200]));
    expect(new Set(results.map((r) => r.body.providerSessionId)).size).toBe(1);
    expect(await prisma.providerGameSession.count()).toBe(2);
  });

  it("rejects reusing a casino session token for another player", async () => {
    const body = launchBody();
    await providerPost("/launch", body);

    const res = await providerPost("/launch", { ...body, userId: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("SESSION_CONFLICT");
  });

  it.each([
    ["an unknown game", { gameId: "no-such-game" }, "GAME_NOT_FOUND"],
    ["an unregistered casino", { casinoCode: "OTHER" }, "CASINO_NOT_FOUND"],
  ])("rejects %s", async (_case, overrides, error) => {
    const res = await providerPost("/launch", launchBody(overrides));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe(error);
  });
});
