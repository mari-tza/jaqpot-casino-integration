import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { closeRound, failRound, getBalance, openRound, send } from "../../src/provider/services/round.service";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, resetCasino, userId } from "../helpers/casino";
import { useLiveServer } from "../helpers/liveServer";
import { resetProvider } from "../helpers/provider";

useLiveServer();
afterEach(async () => {
  vi.restoreAllMocks();
  await resetCasino();
  await resetProvider();
});

const app = createApp();

/** Launches alice through the casino and opens a provider round on that session. */
async function startRound() {
  const game = await prisma.casinoGame.findFirstOrThrow({ where: { providerGameId: "slots-777" } });
  const launched = await request(app)
    .post("/casino/launchGame")
    .send({ userId: await userId("alice"), gameId: game.id, currency: "USD" });
  const session = await prisma.providerGameSession.findUniqueOrThrow({
    where: { providerSessionId: launched.body.providerSessionId },
    include: { customer: { include: { casino: true } } },
  });
  return openRound(session, { backoffMs: 1 });
}

const bet = (transactionId: string, amount: number) => ({ type: "BET" as const, transactionId, amount });
const row = (transactionId: string) => prisma.providerBet.findUniqueOrThrow({ where: { transactionId } });

describe("provider rounds", () => {
  it("reads the balance from the casino", async () => {
    const round = await startRound();

    expect(await getBalance(round)).toEqual({ balance: "100000", currency: "USD" });
  });

  it("records a bet as PENDING before calling the casino, then stores the answer", async () => {
    const round = await startRound();
    const realFetch = globalThis.fetch;
    let statusDuringCall: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (...args) => {
      statusDuringCall = (await row("bet_1")).status;
      return realFetch(...args);
    });

    await send(round, bet("bet_1", 1000));

    expect(statusDuringCall).toBe("PENDING");
    expect(await row("bet_1")).toMatchObject({
      status: "ACCEPTED",
      casinoBalanceAfter: BigInt(99_000),
      responseCache: { balance: "99000", transactionId: "bet_1" },
    });
  });

  it("resends a bet on the same row, and the casino replays it", async () => {
    const round = await startRound();

    const first = await send(round, bet("bet_1", 1000));
    const again = await send(round, bet("bet_1", 1000));

    expect(again).toEqual(first);
    expect(await prisma.providerBet.count()).toBe(1);
    expect(await prisma.casinoTransaction.count()).toBe(1);
    expect(await balanceOf("alice")).toBe(BigInt(99_000));
  });

  it("marks a rejected bet FAILED with the casino's answer", async () => {
    const round = await startRound();

    await expect(send(round, bet("bet_1", 50))).rejects.toMatchObject({ status: 422 });

    expect(await row("bet_1")).toMatchObject({
      status: "FAILED",
      responseCache: { error: "BET_LIMIT_EXCEEDED" },
    });
  });

  it("leaves a bet PENDING when the casino does not answer", async () => {
    const round = await startRound();
    round.session.customer.casino.casinoApiEndpoint = "http://127.0.0.1:1";

    await expect(send(round, bet("bet_1", 1000))).rejects.toMatchObject({ code: "CASINO_UNAVAILABLE" });

    expect((await row("bet_1")).status).toBe("PENDING");
  });

  it("marks a rolled back bet ROLLED_BACK", async () => {
    const round = await startRound();
    await send(round, bet("bet_1", 1000));

    const res = await send(round, {
      type: "ROLLBACK",
      transactionId: "rb_1",
      amount: 1000,
      relatedTransactionId: "bet_1",
    });

    expect(res).toMatchObject({ balance: "100000", tombstone: false });
    expect((await row("bet_1")).status).toBe("ROLLED_BACK");
    expect((await row("rb_1")).status).toBe("ACCEPTED");
  });

  it("closes a round with the totals of accepted bets and payouts", async () => {
    const round = await startRound();
    await send(round, bet("bet_1", 1000));
    await send(round, bet("bet_2", 500));
    await send(round, { type: "ROLLBACK", transactionId: "rb_2", amount: 500, relatedTransactionId: "bet_2" });
    await send(round, { type: "WIN", transactionId: "win_1", amount: 2500, relatedTransactionId: "bet_1" });

    const closed = await closeRound(round);

    expect(closed).toMatchObject({
      status: "CLOSED",
      totalBetAmount: BigInt(1000),
      totalPayoutAmount: BigInt(2500),
    });
  });

  it("refunds accepted bets when a round fails before its payout", async () => {
    const round = await startRound();
    await send(round, bet("bet_1", 1000));

    await failRound(round);

    expect((await row("bet_1")).status).toBe("ROLLED_BACK");
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
    expect((await prisma.providerGameRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe("FAILED");
  });

  it("keeps the bets of a failed round that already has a payout", async () => {
    const round = await startRound();
    await send(round, bet("bet_1", 1000));
    await send(round, { type: "WIN", transactionId: "win_1", amount: 0, relatedTransactionId: "bet_1" });

    await failRound(round);

    expect((await row("bet_1")).status).toBe("ACCEPTED");
    expect(await balanceOf("alice")).toBe(BigInt(99_000));
  });
});
