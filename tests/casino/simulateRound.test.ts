import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/shared/db/prisma";
import { SEED_BALANCES, balanceOf, resetCasino, userId, type Player } from "../helpers/casino";
import { useLiveServer } from "../helpers/liveServer";
import { resetProvider } from "../helpers/provider";

useLiveServer();
afterEach(async () => {
  vi.restoreAllMocks();
  await resetCasino();
  await resetProvider();
});

const app = createApp();
const NET_WIN = BigInt(1500); // -1000 bet, +2500 payout; the other bet is rolled back

async function simulateRound(player: Player, headers: Record<string, string> = {}) {
  const game = await prisma.casinoGame.findFirstOrThrow({ where: { providerGameId: "slots-777" } });
  return request(app)
    .post("/casino/simulateRound")
    .set(headers)
    .send({ userId: await userId(player), gameId: game.id, currency: "USD" });
}

describe("POST /casino/simulateRound", () => {
  it.each(["alice", "bob"] as const)("plays a full round for %s", async (player) => {
    const res = await simulateRound(player);

    expect(res.status).toBe(200);
    expect(res.body.round).toMatchObject({
      status: "CLOSED",
      startingBalance: SEED_BALANCES[player].toString(),
      finalBalance: (SEED_BALANCES[player] + NET_WIN).toString(),
    });
    expect(await balanceOf(player)).toBe(SEED_BALANCES[player] + NET_WIN);

    const ledger = await prisma.casinoTransaction.findMany({ orderBy: { id: "asc" } });
    expect(ledger.map((t) => t.transactionType)).toEqual(["DEBIT", "DEBIT", "ROLLBACK", "CREDIT"]);
    expect(new Set(ledger.map((t) => t.roundId))).toEqual(new Set([res.body.round.roundId]));
  });

  it("moves money once per run when re-run", async () => {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push((await simulateRound("alice")).body.round);

    expect(runs[1].startingBalance).toBe(runs[0].finalBalance);
    expect(runs[2].startingBalance).toBe(runs[1].finalBalance);
    expect(await balanceOf("alice")).toBe(SEED_BALANCES.alice + NET_WIN * BigInt(3));
    expect(await prisma.casinoTransaction.count()).toBe(12);
    expect(await prisma.providerGameRound.count({ where: { status: "CLOSED" } })).toBe(3);
  });

  it("keeps the balance right when rounds run at the same time", async () => {
    const results = await Promise.all([simulateRound("alice"), simulateRound("alice"), simulateRound("alice")]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await balanceOf("alice")).toBe(SEED_BALANCES.alice + NET_WIN * BigInt(3));
  });

  it("carries the request id through every call of the round", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await simulateRound("alice", { "x-request-id": "trace-round" });

    const urls = fetchSpy.mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(urls).toEqual([
      "/provider/launch",
      "/provider/simulate",
      "/casino/getBalance",
      "/casino/debit",
      "/casino/debit",
      "/casino/debit",
      "/casino/rollback",
      "/casino/credit",
      "/casino/getBalance",
    ]);
    for (const [, init] of fetchSpy.mock.calls) {
      expect((init?.headers as Record<string, string>)["x-request-id"]).toBe("trace-round");
    }
  });

  it("reports a failed round as a provider error, with the balance untouched", async () => {
    await prisma.casinoWallet.updateMany({ where: { user: { username: "alice" } }, data: { playableBalance: 1200 } });

    const res = await simulateRound("alice");

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: "PROVIDER_ERROR", details: { status: 422, error: "ROUND_FAILED" } });
    expect(await balanceOf("alice")).toBe(BigInt(1200));
  });

  it("validates the body", async () => {
    const res = await request(app).post("/casino/simulateRound").send({ userId: "alice" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });
});
