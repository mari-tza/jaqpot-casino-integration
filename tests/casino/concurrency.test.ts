import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, casinoPost, openSession, resetCasino } from "../helpers/casino";
import { round } from "../helpers/round";

afterEach(resetCasino);

const parallel = <T>(n: number, fn: (i: number) => Promise<T>) =>
  Promise.all(Array.from({ length: n }, (_, i) => fn(i)));

describe("concurrent callbacks", () => {
  it("never overdraws: 10 parallel bets of 20,000 on a 100,000 balance → exactly 5 accepted", async () => {
    const s = await openSession("alice");

    const results = await parallel(10, (i) =>
      casinoPost("/debit", {
        sessionToken: s.token,
        userId: s.userId,
        currency: "USD",
        roundId: "round_1",
        transactionId: `bet_${i}`,
        amount: 20_000,
      }),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.body.error === "INSUFFICIENT_FUNDS")).toHaveLength(5);
    expect(await balanceOf("alice")).toBe(BigInt(0));

    // Each accepted bet saw the previous one's result: no lost updates.
    const after = (await prisma.casinoTransaction.findMany()).map((t) => Number(t.balanceAfter)).sort((a, b) => b - a);
    expect(after).toEqual([80_000, 60_000, 40_000, 20_000, 0]);
  });

  it("applies 10 simultaneous copies of the same bet once, and answers all of them the same", async () => {
    const s = await openSession("alice");
    const body = {
      sessionToken: s.token,
      userId: s.userId,
      currency: "USD",
      roundId: "round_1",
      transactionId: `bet_${randomUUID()}`,
      amount: 500,
    };

    const results = await parallel(10, () => casinoPost("/debit", body));

    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(new Set(results.map((r) => JSON.stringify(r.body))).size).toBe(1);
    expect(await prisma.casinoTransaction.count()).toBe(1);
    expect(await balanceOf("alice")).toBe(BigInt(99_500));
  });

  it("lets only one wallet claim a transactionId sent for two players at once", async () => {
    const [alice, bob] = await Promise.all([openSession("alice"), openSession("bob")]);
    const transactionId = `bet_${randomUUID()}`;
    const bet = (s: typeof alice) =>
      casinoPost("/debit", {
        sessionToken: s.token,
        userId: s.userId,
        currency: "USD",
        roundId: "round_1",
        transactionId,
        amount: 500,
      });

    const results = await Promise.all([bet(alice), bet(bob)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.casinoTransaction.count()).toBe(1);
  });

  it("refunds a bet once when 5 different rollbacks for it arrive together", async () => {
    const r = await round();
    await r.bet("bet_a", 500);

    const results = await parallel(5, () => r.rollback("bet_a"));

    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
  });

  it("never records a rollback after a payout in the same round, whichever wins the race", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await round();
      await r.bet(`a_${i}`, 500);
      await r.bet(`b_${i}`, 1000);

      const [rb, win] = await Promise.all([r.rollback(`b_${i}`, `rb_${i}`), r.win(`win_${i}`, 2000, `a_${i}`)]);

      expect(win.status).toBe(200);
      if (rb.status === 200) {
        const row = (id: string) =>
          prisma.casinoTransaction.findUniqueOrThrow({ where: { externalTransactionId: id } });
        expect((await row(`rb_${i}`)).id).toBeLessThan((await row(`win_${i}`)).id);
      } else {
        expect(rb.body.message).toBe("Round already has a payout");
      }
    }
  });

  it("ends with the bet not charged when it races its own tombstone", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await round();

      const [bet, rb] = await Promise.all([r.bet(`bet_${i}`, 700), r.rollback(`bet_${i}`)]);

      expect(rb.status).toBe(200);
      if (bet.status === 200)
        expect(rb.body.tombstone).toBe(false); // bet first → refunded
      else expect(bet.body.error).toBe("BET_ALREADY_ROLLED_BACK"); // tombstone first → bet rejected
      expect(await balanceOf("alice")).toBe(BigInt(100_000));
    }
  });
});
