import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../../src/shared/db/prisma";

const ROLLBACK = new Error("rollback test transaction");

/** Runs fn in a transaction that is always rolled back, so tests leave no rows behind. */
async function inRolledBackTx(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  await prisma
    .$transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    })
    .catch((err) => {
      if (err !== ROLLBACK) throw err;
    });
}

/** A session on alice's wallet, to attach ledger rows to. */
async function aliceSession(tx: Prisma.TransactionClient) {
  const wallet = await tx.casinoWallet.findFirstOrThrow({ where: { user: { username: "alice" } } });
  const game = await tx.casinoGame.findFirstOrThrow();
  return tx.casinoGameSession.create({
    data: { token: `test_${Date.now()}`, userId: wallet.userId, walletId: wallet.id, gameId: game.id },
  });
}

function ledgerRow(
  session: { id: number; walletId: number },
  overrides: Partial<Prisma.CasinoTransactionUncheckedCreateInput> = {},
) {
  return {
    walletId: session.walletId,
    sessionId: session.id,
    roundId: "round_1",
    transactionType: "DEBIT",
    amount: BigInt(500),
    externalTransactionId: "tx_1",
    balanceAfter: BigInt(99_500),
    responseCache: {},
    ...overrides,
  };
}

describe("seed", () => {
  it("creates alice and bob with USD wallets", async () => {
    const wallets = await prisma.casinoWallet.findMany({ include: { user: true }, orderBy: { userId: "asc" } });

    expect(wallets.map((w) => [w.user.username, w.currencyCode, w.playableBalance])).toEqual([
      ["alice", "USD", BigInt(100_000)],
      ["bob", "USD", BigInt(50_000)],
    ]);
  });
});

describe("database constraints", () => {
  it("rejects a negative wallet balance", async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        await tx.$executeRaw`UPDATE casino_wallets SET playable_balance = -1 WHERE id = (SELECT MIN(id) FROM casino_wallets)`;
      }),
    ).rejects.toThrow(/casino_wallets_playable_balance_non_negative/);
  });

  it("rejects a second ledger row with the same external transaction id", async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        const session = await aliceSession(tx);
        await tx.casinoTransaction.create({ data: ledgerRow(session) });
        await tx.casinoTransaction.create({ data: ledgerRow(session) });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects an unknown transaction type", async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        const session = await aliceSession(tx);
        await tx.casinoTransaction.create({ data: ledgerRow(session, { transactionType: "REFUND" }) });
      }),
    ).rejects.toThrow(/casino_transactions_type_valid/);
  });

  it("rejects a second wallet for the same user and currency", async () => {
    await expect(
      inRolledBackTx(async (tx) => {
        const wallet = await tx.casinoWallet.findFirstOrThrow();
        await tx.casinoWallet.create({ data: { userId: wallet.userId, currencyCode: wallet.currencyCode } });
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
