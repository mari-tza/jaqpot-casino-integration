import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, resetCasino } from "../helpers/casino";
import { round } from "../helpers/round";

afterEach(resetCasino);

describe("POST /casino/rollback", () => {
  it("refunds the bet", async () => {
    const r = await round();
    await r.bet("bet_a", 500);

    const res = await r.rollback("bet_a", "rb_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: "100000", transactionId: "rb_1", tombstone: false });
    expect(await prisma.casinoTransaction.findUnique({ where: { externalTransactionId: "rb_1" } })).toMatchObject({
      transactionType: "ROLLBACK",
      amount: BigInt(500),
      relatedExternalTransactionId: "bet_a",
    });
  });

  it("answers a retry with the first response and refunds once", async () => {
    const r = await round();
    await r.bet("bet_a", 500);

    const first = await r.rollback("bet_a", "rb_1");
    const retry = await r.rollback("bet_a", "rb_1");

    expect(retry.body).toEqual(first.body);
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
  });

  it("refunds a bet at most once, even with a new rollback id", async () => {
    const r = await round();
    await r.bet("bet_a", 500);
    await r.rollback("bet_a");

    const second = await r.rollback("bet_a");

    expect(second.status).toBe(409);
    expect(second.body.message).toBe("Bet was already rolled back");
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
  });

  it("never rolls back a payout", async () => {
    const r = await round();
    await r.bet("bet_a", 500);
    await r.win("win_a", 2000, "bet_a");

    const res = await r.rollback("win_a");

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Only bets can be rolled back");
    expect(await balanceOf("alice")).toBe(BigInt(101_500));
  });

  describe("no rollback once the round has a payout", () => {
    it("rejects rolling back the bet that was paid", async () => {
      const r = await round();
      await r.bet("bet_a", 500);
      await r.win("win_a", 2000, "bet_a");

      const res = await r.rollback("bet_a");

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Round already has a payout");
    });

    it("rejects rolling back any other bet of that round", async () => {
      const r = await round();
      await r.bet("bet_a", 500);
      await r.bet("bet_b", 1000);
      await r.win("win_a", 2000, "bet_a");

      const res = await r.rollback("bet_b");

      expect(res.status).toBe(409);
      expect(await balanceOf("alice")).toBe(BigInt(100_500)); // 100000 - 500 - 1000 + 2000
    });

    it("a zero payout closes the round too", async () => {
      const r = await round();
      await r.bet("bet_a", 500);
      await r.win("win_a", 0, "bet_a");

      expect((await r.rollback("bet_a")).status).toBe(409);
    });

    it("allows a rollback before the payout", async () => {
      const r = await round();
      await r.bet("bet_a", 500);
      await r.bet("bet_b", 1000);

      expect((await r.rollback("bet_b")).status).toBe(200);
      expect((await r.win("win_a", 2000, "bet_a")).status).toBe(200);
      expect(await balanceOf("alice")).toBe(BigInt(101_500));
    });
  });

  it("rejects another player's bet", async () => {
    const bob = await round("bob");
    await bob.bet("bet_bob", 500);
    const alice = await round("alice", bob.roundId);

    const res = await alice.rollback("bet_bob");

    expect(res.status).toBe(409);
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
    expect(await balanceOf("bob")).toBe(BigInt(49_500));
  });

  it("rejects a rollback sent for another round", async () => {
    const r = await round();
    await r.bet("bet_a", 500);

    const res = await r.inRound("round_other").rollback("bet_a");

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Bet is not on this wallet and round");
  });
});
