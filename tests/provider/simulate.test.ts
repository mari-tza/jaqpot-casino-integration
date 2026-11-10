import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, resetCasino, userId } from "../helpers/casino";
import { useLiveServer } from "../helpers/liveServer";
import { providerPost, resetProvider } from "../helpers/provider";

useLiveServer();
afterEach(async () => {
  await resetCasino();
  await resetProvider();
});

const app = createApp();

/** Launches alice through the casino; returns the body the casino sends to /provider/simulate. */
async function launchedSession() {
  const game = await prisma.casinoGame.findFirstOrThrow({ where: { providerGameId: "slots-777" } });
  const alice = await userId("alice");
  const res = await request(app).post("/casino/launchGame").send({ userId: alice, gameId: game.id, currency: "USD" });
  return {
    providerSessionId: res.body.providerSessionId as string,
    sessionToken: res.body.sessionToken as string,
    userId: alice,
    currency: "USD",
    casinoCode: "HOUSE",
  };
}

describe("POST /provider/simulate", () => {
  it("plays the scripted round against the casino", async () => {
    const res = await providerPost("/simulate", await launchedSession());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "CLOSED",
      startingBalance: "100000",
      finalBalance: "101500",
      totalBet: "1000",
      totalPayout: "2500",
    });
    expect(res.body.steps.map((s: { step: string }) => s.step)).toEqual([
      "balance",
      "bet",
      "bet",
      "duplicate_bet",
      "rollback",
      "win",
      "balance",
    ]);
    expect(await balanceOf("alice")).toBe(BigInt(101_500));
  });

  it("gets the first answer back for the resent bet", async () => {
    const res = await providerPost("/simulate", await launchedSession());
    const [, betA, , resent] = res.body.steps;

    expect(resent).toMatchObject({ transactionId: betA.transactionId, balance: "99000", replayed: true });
    expect(await prisma.casinoTransaction.count({ where: { transactionType: "DEBIT" } })).toBe(2);
  });

  it("leaves one row per call, with the rolled back bet marked", async () => {
    await providerPost("/simulate", await launchedSession());

    const bets = await prisma.providerBet.findMany({ orderBy: { id: "asc" } });
    expect(bets.map((b) => [b.betType, b.status])).toEqual([
      ["BET", "ACCEPTED"],
      ["BET", "ROLLED_BACK"],
      ["ROLLBACK", "ACCEPTED"],
      ["WIN", "ACCEPTED"],
    ]);
  });

  it("requires the casino's signature", async () => {
    const res = await request(app)
      .post("/provider/simulate")
      .send(await launchedSession());

    expect(res.status).toBe(401);
  });

  it("rejects an unknown or inactive session", async () => {
    const body = await launchedSession();
    const unknown = await providerPost("/simulate", { ...body, providerSessionId: "psess_unknown" });
    await prisma.providerGameSession.update({
      where: { providerSessionId: body.providerSessionId },
      data: { isActive: false },
    });
    const inactive = await providerPost("/simulate", body);

    for (const res of [unknown, inactive]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("SESSION_NOT_FOUND");
    }
  });

  it.each([
    ["another casino session token", { sessionToken: "not-this-session" }],
    ["another player", { userId: 999_999 }],
    ["another currency", { currency: "EUR" }],
    ["another casino", { casinoCode: "OTHER" }],
  ])("rejects %s", async (_case, overrides) => {
    const res = await providerPost("/simulate", { ...(await launchedSession()), ...overrides });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("SESSION_MISMATCH");
    expect(await prisma.providerGameRound.count()).toBe(0);
  });

  it("fails the round and refunds accepted bets when the casino rejects one", async () => {
    const body = await launchedSession();
    await prisma.casinoWallet.updateMany({ where: { userId: body.userId }, data: { playableBalance: 1200 } });

    const res = await providerPost("/simulate", body);

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: "ROUND_FAILED",
      details: { step: "bet", casinoStatus: 422, casinoError: "INSUFFICIENT_FUNDS" },
    });
    expect(await balanceOf("alice")).toBe(BigInt(1200));
    expect(await prisma.providerGameRound.findFirstOrThrow()).toMatchObject({ status: "FAILED" });
    const bets = await prisma.providerBet.findMany({ orderBy: { id: "asc" } });
    expect(bets.map((b) => [b.betType, b.status])).toEqual([
      ["BET", "ROLLED_BACK"],
      ["BET", "FAILED"],
      ["ROLLBACK", "ACCEPTED"],
    ]);
  });

  it("fails the round when the casino does not answer", async () => {
    const body = await launchedSession();
    const casino = await prisma.providerCasino.findUniqueOrThrow({ where: { casinoCode: "HOUSE" } });
    await prisma.providerCasino.update({
      where: { id: casino.id },
      data: { casinoApiEndpoint: "http://127.0.0.1:1" },
    });

    try {
      const res = await providerPost("/simulate", body);

      expect(res.status).toBe(502);
      expect(res.body.error).toBe("CASINO_UNAVAILABLE");
      expect(await prisma.providerGameRound.findFirstOrThrow()).toMatchObject({ status: "FAILED" });
    } finally {
      await prisma.providerCasino.update({
        where: { id: casino.id },
        data: { casinoApiEndpoint: casino.casinoApiEndpoint },
      });
    }
  });
});
