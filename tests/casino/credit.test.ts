import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, casinoPost, openSession, resetCasino, type Player } from "../helpers/casino";

afterEach(resetCasino);

/** A session with one accepted 500 bet in round_1. */
async function sessionWithBet(player: Player = "alice") {
  const s = await openSession(player);
  const base = { sessionToken: s.token, userId: s.userId, currency: "USD", roundId: "round_1" };
  const betId = `bet_${randomUUID()}`;
  await casinoPost("/debit", { ...base, transactionId: betId, amount: 500 });

  const pay = (overrides: Record<string, unknown> = {}) =>
    casinoPost("/credit", {
      ...base,
      transactionId: `win_${randomUUID()}`,
      amount: 2000,
      relatedTransactionId: betId,
      ...overrides,
    });
  return { base, betId, pay };
}

describe("POST /casino/credit", () => {
  it("pays out and returns the new balance", async () => {
    const { pay } = await sessionWithBet();

    const res = await pay();

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe("101500"); // 100000 - 500 + 2000
  });

  it("links the payout to its bet in the ledger", async () => {
    const { pay, betId } = await sessionWithBet();

    const res = await pay();

    const row = await prisma.casinoTransaction.findUniqueOrThrow({
      where: { externalTransactionId: res.body.transactionId },
    });
    expect(row).toMatchObject({ transactionType: "CREDIT", relatedExternalTransactionId: betId, roundId: "round_1" });
  });

  it("accepts a zero payout for a lost round", async () => {
    const { pay } = await sessionWithBet();

    const res = await pay({ amount: 0 });

    expect(res.status).toBe(200);
    expect(res.body.balance).toBe("99500");
  });

  it("answers a retry with the first response and pays once", async () => {
    const { pay } = await sessionWithBet();
    const transactionId = `win_${randomUUID()}`;

    const first = await pay({ transactionId });
    const retry = await pay({ transactionId });

    expect(retry.body).toEqual(first.body);
    expect(await balanceOf("alice")).toBe(BigInt(101_500));
  });

  it("rejects a reused transactionId pointing at a different bet", async () => {
    const { pay, base } = await sessionWithBet();
    const otherBet = `bet_${randomUUID()}`;
    await casinoPost("/debit", { ...base, transactionId: otherBet, amount: 100 });
    const transactionId = `win_${randomUUID()}`;
    await pay({ transactionId });

    const res = await pay({ transactionId, relatedTransactionId: otherBet });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("IDEMPOTENCY_CONFLICT");
  });

  describe("must reference an accepted bet on the same wallet and round", () => {
    it("rejects an unknown bet", async () => {
      const { pay } = await sessionWithBet();

      const res = await pay({ relatedTransactionId: "bet_never_seen" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("CREDIT_NOT_ALLOWED");
    });

    it("rejects a bet from another round", async () => {
      const { pay } = await sessionWithBet();

      const res = await pay({ roundId: "round_2" });

      expect(res.status).toBe(409);
      expect(res.body.message).toBe("Payout and bet are in different rounds");
    });

    it("rejects another player's bet", async () => {
      const bob = await sessionWithBet("bob");
      const alice = await sessionWithBet("alice");

      const res = await alice.pay({ relatedTransactionId: bob.betId });

      expect(res.status).toBe(409);
      expect(await balanceOf("alice")).toBe(BigInt(99_500));
    });

    it("rejects a payout that points at another payout", async () => {
      const { pay } = await sessionWithBet();
      const win = await pay();

      const res = await pay({ relatedTransactionId: win.body.transactionId });

      expect(res.status).toBe(409);
    });
  });
});
