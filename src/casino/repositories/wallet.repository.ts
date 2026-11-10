import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** SELECT … FOR UPDATE: other writers on this wallet wait until we commit. */
export async function lockWallet(tx: Tx, walletId: number): Promise<{ balance: bigint } | null> {
  const rows = await tx.$queryRaw<{ playable_balance: bigint }[]>`
    SELECT playable_balance FROM casino_wallets WHERE id = ${walletId} FOR UPDATE`;
  const row = rows[0];
  return row ? { balance: row.playable_balance } : null;
}

export async function setBalance(tx: Tx, walletId: number, balance: bigint) {
  await tx.casinoWallet.update({ where: { id: walletId }, data: { playableBalance: balance } });
}
