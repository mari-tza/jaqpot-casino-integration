import { Prisma, type CasinoTransaction } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { IdempotencyConflictError, InsufficientFundsError, WalletNotFoundError } from "../errors";
import { createLedgerRow, findByExternalId, type TransactionType } from "../repositories/transaction.repository";
import { lockWallet, setBalance } from "../repositories/wallet.repository";

export interface MoneyRequest {
  walletId: number;
  sessionId: number;
  roundId: string;
  transactionId: string;
}

/** Stored in response_cache and replayed to retries. */
export interface MoneyResponse {
  balance: string;
  transactionId: string;
  tombstone?: boolean;
}

/** What a retry must match to count as the same request. */
interface Fingerprint {
  type: TransactionType;
  amount?: bigint;
  relatedTransactionId?: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Applies a money operation once per transactionId.
 * Lock the wallet first, then look for the id: concurrent copies of a request
 * queue on the lock, and the later ones replay the first one's response.
 */
async function runOnce(
  req: MoneyRequest,
  fingerprint: Fingerprint,
  work: (tx: Tx, balance: bigint) => Promise<MoneyResponse>,
): Promise<MoneyResponse> {
  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, req.walletId);
      if (!wallet) throw new WalletNotFoundError();

      const existing = await findByExternalId(req.transactionId, tx);
      if (existing) return replay(existing, req.walletId, fingerprint);

      return work(tx, wallet.balance);
    });
  } catch (err) {
    // Same id used concurrently on another wallet: the UNIQUE constraint wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await findByExternalId(req.transactionId);
      if (existing) return replay(existing, req.walletId, fingerprint);
    }
    throw err;
  }
}

function replay(existing: CasinoTransaction, walletId: number, fp: Fingerprint): MoneyResponse {
  const same =
    existing.walletId === walletId &&
    existing.transactionType === fp.type &&
    (fp.amount === undefined || existing.amount === fp.amount) &&
    (fp.relatedTransactionId === undefined || existing.relatedExternalTransactionId === fp.relatedTransactionId);
  if (!same) throw new IdempotencyConflictError();
  return existing.responseCache as unknown as MoneyResponse;
}

/** New balance and ledger row, in the caller's transaction. */
async function record(
  tx: Tx,
  req: MoneyRequest,
  type: TransactionType,
  amount: bigint,
  newBalance: bigint,
  relatedTransactionId?: string,
  extra: Partial<MoneyResponse> = {},
): Promise<MoneyResponse> {
  const response: MoneyResponse = { balance: newBalance.toString(), transactionId: req.transactionId, ...extra };
  await setBalance(tx, req.walletId, newBalance);
  await createLedgerRow(tx, {
    walletId: req.walletId,
    sessionId: req.sessionId,
    roundId: req.roundId,
    transactionType: type,
    amount,
    externalTransactionId: req.transactionId,
    relatedExternalTransactionId: relatedTransactionId,
    balanceAfter: newBalance,
    responseCache: { ...response },
  });
  return response;
}

export function debit(req: MoneyRequest, amount: bigint): Promise<MoneyResponse> {
  return runOnce(req, { type: "DEBIT", amount }, async (tx, balance) => {
    if (balance < amount) throw new InsufficientFundsError();
    return record(tx, req, "DEBIT", amount, balance - amount);
  });
}
