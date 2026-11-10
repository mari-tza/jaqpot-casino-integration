import { Prisma, type CasinoTransaction } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  BetAlreadyRolledBackError,
  CreditNotAllowedError,
  IdempotencyConflictError,
  InsufficientFundsError,
  RollbackNotAllowedError,
  WalletNotFoundError,
} from "../errors";
import {
  createLedgerRow,
  findByExternalId,
  findCreditInRound,
  findRollbackFor,
  type TransactionType,
} from "../repositories/transaction.repository";
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
      if (existing) return replay(existing, req, fingerprint);

      return work(tx, wallet.balance);
    });
  } catch (err) {
    // Same id used concurrently on another wallet: the UNIQUE constraint wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await findByExternalId(req.transactionId);
      if (existing) return replay(existing, req, fingerprint);
    }
    throw err;
  }
}

function replay(existing: CasinoTransaction, req: MoneyRequest, fp: Fingerprint): MoneyResponse {
  const same =
    existing.walletId === req.walletId &&
    existing.roundId === req.roundId &&
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
    // The provider already cancelled this bet: never charge it.
    if (await findRollbackFor(req.transactionId, tx)) throw new BetAlreadyRolledBackError();
    if (balance < amount) throw new InsufficientFundsError();
    return record(tx, req, "DEBIT", amount, balance - amount);
  });
}

/** A payout must point at an accepted, not rolled back bet on the same wallet and round. */
export function credit(req: MoneyRequest, amount: bigint, betTransactionId: string): Promise<MoneyResponse> {
  const fp: Fingerprint = { type: "CREDIT", amount, relatedTransactionId: betTransactionId };

  return runOnce(req, fp, async (tx, balance) => {
    const bet = await findByExternalId(betTransactionId, tx);
    if (!bet || bet.transactionType !== "DEBIT" || bet.walletId !== req.walletId) {
      throw new CreditNotAllowedError("Payout must reference an accepted bet on this wallet");
    }
    if (bet.roundId !== req.roundId) throw new CreditNotAllowedError("Payout and bet are in different rounds");
    if (await findRollbackFor(betTransactionId, tx)) throw new CreditNotAllowedError("Bet was rolled back");

    return record(tx, req, "CREDIT", amount, balance + amount, betTransactionId);
  });
}

/**
 * Refunds a bet: only DEBITs, on their own wallet and round, at most once, before any payout.
 * Unknown bet in an unpaid round → tombstone: recorded, success, no balance change.
 */
export function rollback(req: MoneyRequest, betTransactionId: string): Promise<MoneyResponse> {
  const fp: Fingerprint = { type: "ROLLBACK", relatedTransactionId: betTransactionId };

  return runOnce(req, fp, async (tx, balance) => {
    if (await findRollbackFor(betTransactionId, tx)) throw new RollbackNotAllowedError("Bet was already rolled back");

    const bet = await findByExternalId(betTransactionId, tx);
    if (bet) {
      if (bet.transactionType !== "DEBIT") throw new RollbackNotAllowedError("Only bets can be rolled back");
      if (bet.walletId !== req.walletId || bet.roundId !== req.roundId) {
        throw new RollbackNotAllowedError("Bet is not on this wallet and round");
      }
    }
    // Applies to unknown bets too: no tombstone in a paid round.
    if (await findCreditInRound(req.walletId, req.roundId, tx)) {
      throw new RollbackNotAllowedError("Round already has a payout");
    }

    if (!bet) return record(tx, req, "ROLLBACK", BigInt(0), balance, betTransactionId, { tombstone: true });
    return record(tx, req, "ROLLBACK", bet.amount, balance + bet.amount, betTransactionId, { tombstone: false });
  });
}
