import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { balanceOf, casinoPost, openSession, resetCasino, type Player } from "../helpers/casino";

afterEach(resetCasino);

async function debitBody(overrides: Record<string, unknown> = {}, player: Player = "alice") {
  const s = await openSession(player);
  return {
    sessionToken: s.token,
    userId: s.userId,
    currency: "USD",
    transactionId: `bet_${randomUUID()}`,
    roundId: "round_1",
    amount: 500,
    ...overrides,
  };
}

describe("POST /casino/debit", () => {
  it("debits the wallet and returns the new balance", async () => {
    const body = await debitBody();

    const res = await casinoPost("/debit", body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ balance: "99500", transactionId: body.transactionId });
    expect(await balanceOf("alice")).toBe(BigInt(99_500));
  });

  it("writes one ledger row with the round and the balance after", async () => {
    const body = await debitBody();

    await casinoPost("/debit", body);

    const rows = await prisma.casinoTransaction.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transactionType: "DEBIT",
      amount: BigInt(500),
      roundId: "round_1",
      externalTransactionId: body.transactionId,
      balanceAfter: BigInt(99_500),
    });
  });

  it("rejects a bet larger than the balance and changes nothing", async () => {
    const res = await casinoPost("/debit", await debitBody({ amount: 60_000 }, "bob")); // bob has 50,000

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INSUFFICIENT_FUNDS");
    expect(await balanceOf("bob")).toBe(BigInt(50_000));
    expect(await prisma.casinoTransaction.count()).toBe(0);
  });

  it.each([
    ["below the minimum", 99],
    ["above the maximum", 100_001],
  ])("rejects a bet %s of the game", async (_case, amount) => {
    const res = await casinoPost("/debit", await debitBody({ amount }));

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("BET_LIMIT_EXCEEDED");
  });

  it.each([
    ["a negative amount", -5],
    ["a fractional amount", 10.5],
    ["an amount as text", "500"],
  ])("rejects %s", async (_case, amount) => {
    const res = await casinoPost("/debit", await debitBody({ amount }));

    expect(res.status).toBe(400);
  });

  describe("idempotency", () => {
    it("answers a retry with the first response and debits once", async () => {
      const body = await debitBody();

      const first = await casinoPost("/debit", body);
      await casinoPost("/debit", await debitBody({ amount: 1000 })); // balance moves in between
      const retry = await casinoPost("/debit", body);

      expect(retry.status).toBe(200);
      expect(retry.body).toEqual(first.body);
      expect(await prisma.casinoTransaction.count({ where: { externalTransactionId: body.transactionId } })).toBe(1);
      expect(await balanceOf("alice")).toBe(BigInt(98_500));
    });

    it("rejects a transactionId reused with a different amount", async () => {
      const body = await debitBody();
      await casinoPost("/debit", body);

      const res = await casinoPost("/debit", { ...body, amount: 900 });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("IDEMPOTENCY_CONFLICT");
    });

    it("rejects a transactionId reused in another round", async () => {
      const body = await debitBody();
      await casinoPost("/debit", body);

      const res = await casinoPost("/debit", { ...body, roundId: "round_2" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("IDEMPOTENCY_CONFLICT");
      expect(await balanceOf("alice")).toBe(BigInt(99_500));
    });

    it("does not cache failures: a retry after a deposit can succeed", async () => {
      const body = await debitBody({ amount: 100_000 });
      await casinoPost("/debit", await debitBody({ amount: 100 }));

      expect((await casinoPost("/debit", body)).status).toBe(422);
      await prisma.casinoWallet.updateMany({
        where: { user: { username: "alice" } },
        data: { playableBalance: 200_000 },
      });

      expect((await casinoPost("/debit", body)).status).toBe(200);
    });
  });
});
