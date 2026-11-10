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

    it("rejects an unknown bet after payout without creating a tombstone", async () => {
      const r = await round();
      await r.bet("bet_a", 500);
      await r.win("win_a", 2000, "bet_a");

      const res = await r.rollback("unknown", "rb_unknown");

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: "ROLLBACK_NOT_ALLOWED", message: "Round already has a payout" });
      expect(await prisma.casinoTransaction.count({ where: { externalTransactionId: "rb_unknown" } })).toBe(0);
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

  describe("tombstone: rollback of a bet the casino never saw", () => {
    it("records a marker, answers success and leaves the balance alone", async () => {
      const r = await round();

      const res = await r.rollback("bet_lost", "rb_1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ balance: "100000", transactionId: "rb_1", tombstone: true });
      expect(await prisma.casinoTransaction.findUnique({ where: { externalTransactionId: "rb_1" } })).toMatchObject({
        transactionType: "ROLLBACK",
        amount: BigInt(0),
        relatedExternalTransactionId: "bet_lost",
      });
    });

    it("rejects the bet if it arrives later", async () => {
      const r = await round();
      await r.rollback("bet_late");

      const late = await r.bet("bet_late", 700);

      expect(late.status).toBe(409);
      expect(late.body.error).toBe("BET_ALREADY_ROLLED_BACK");
      expect(await balanceOf("alice")).toBe(BigInt(100_000));
    });

    it("answers a retry of the tombstone the same way", async () => {
      const r = await round();

      const first = await r.rollback("bet_lost", "rb_1");
      const retry = await r.rollback("bet_lost", "rb_1");

      expect(retry.body).toEqual(first.body);
      expect(await prisma.casinoTransaction.count()).toBe(1);
    });

    it("rejects a second rollback id for the same unknown bet", async () => {
      const r = await round();
      await r.rollback("bet_lost");

      expect((await r.rollback("bet_lost")).status).toBe(409);
    });
  });

  it("blocks a payout for a rolled-back bet", async () => {
    const r = await round();
    await r.bet("bet_a", 500);
    await r.rollback("bet_a");

    const res = await r.win("win_a", 2000, "bet_a");

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Bet was rolled back");
    expect(await balanceOf("alice")).toBe(BigInt(100_000));
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
