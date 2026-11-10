import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";

type Db = Prisma.TransactionClient | PrismaClient;

export type TransactionType = "DEBIT" | "CREDIT" | "ROLLBACK";

export function findByExternalId(externalTransactionId: string, db: Db = prisma) {
  return db.casinoTransaction.findUnique({ where: { externalTransactionId } });
}

export function createLedgerRow(db: Db, data: Prisma.CasinoTransactionUncheckedCreateInput) {
  return db.casinoTransaction.create({ data });
}

/** Any rollback (refund or tombstone) that targets this bet. */
export function findRollbackFor(betTransactionId: string, db: Db = prisma) {
  return db.casinoTransaction.findFirst({
    where: { transactionType: "ROLLBACK", relatedExternalTransactionId: betTransactionId },
  });
}
