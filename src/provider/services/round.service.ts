import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { CasinoRejection, callCasino, type CallOptions } from "../casinoClient";

export type RoundSession = Prisma.ProviderGameSessionGetPayload<{
  include: { customer: { include: { casino: true } } };
}>;

export interface Round {
  id: number;
  roundId: string;
  session: RoundSession;
  opts: CallOptions;
}

export interface CasinoBalance {
  balance: string;
  currency: string;
}

export interface CasinoMoney {
  balance: string;
  transactionId: string;
  tombstone?: boolean;
}

export type Call =
  | { type: "BET"; transactionId: string; amount: number }
  | { type: "WIN"; transactionId: string; amount: number; relatedTransactionId: string }
  | { type: "ROLLBACK"; transactionId: string; amount: number; relatedTransactionId: string };

const PATH = { BET: "/debit", WIN: "/credit", ROLLBACK: "/rollback" } as const;

export async function openRound(session: RoundSession, opts: CallOptions = {}): Promise<Round> {
  const round = await prisma.providerGameRound.create({
    data: {
      roundId: `rnd_${randomUUID()}`,
      sessionId: session.id,
      customerId: session.customerId,
      gameId: session.gameId,
      currency: session.currency,
    },
  });
  return { id: round.id, roundId: round.roundId, session, opts };
}

function casinoCall<T>(round: Round, path: string, extra: object) {
  const { session } = round;
  const body = {
    sessionToken: session.casinoSessionToken,
    userId: Number(session.customer.externalUserId),
    currency: session.currency,
    ...extra,
  };
  return callCasino<T>(session.customer.casino, path, body, round.opts);
}

export function getBalance(round: Round) {
  return casinoCall<CasinoBalance>(round, "/getBalance", {});
}

/**
 * Stores the call as PENDING, then the casino's answer. A row left PENDING means the
 * outcome is unknown and the call can be resent with the same transactionId.
 */
export async function send(round: Round, call: Call): Promise<CasinoMoney> {
  const related = "relatedTransactionId" in call ? call.relatedTransactionId : undefined;
  const bet =
    (await prisma.providerBet.findUnique({ where: { transactionId: call.transactionId } })) ??
    (await prisma.providerBet.create({
      data: {
        transactionId: call.transactionId,
        roundId: round.id,
        betType: call.type,
        amount: BigInt(call.amount),
        relatedTransactionId: related,
      },
    }));

  let res: CasinoMoney;
  try {
    res = await casinoCall<CasinoMoney>(round, PATH[call.type], {
      roundId: round.roundId,
      transactionId: call.transactionId,
      ...(call.type !== "ROLLBACK" && { amount: call.amount }),
      ...(related && { relatedTransactionId: related }),
    });
  } catch (err) {
    if (err instanceof CasinoRejection) {
      await prisma.providerBet.update({
        where: { id: bet.id },
        data: { status: "FAILED", responseCache: err.body },
      });
    }
    throw err;
  }

  await prisma.$transaction([
    prisma.providerBet.update({
      where: { id: bet.id },
      data: { status: "ACCEPTED", casinoBalanceAfter: BigInt(res.balance), responseCache: { ...res } },
    }),
    // Refund or tombstone: either way the bet will never stand.
    ...(call.type === "ROLLBACK"
      ? [
          prisma.providerBet.updateMany({
            where: { roundId: round.id, transactionId: related },
            data: { status: "ROLLED_BACK" },
          }),
        ]
      : []),
  ]);
  return res;
}

/** Totals count accepted bets and payouts only. */
export async function closeRound(round: Round) {
  const bets = await prisma.providerBet.findMany({ where: { roundId: round.id, status: "ACCEPTED" } });
  const total = (type: string) => bets.filter((b) => b.betType === type).reduce((sum, b) => sum + b.amount, BigInt(0));

  return prisma.providerGameRound.update({
    where: { id: round.id },
    data: { status: "CLOSED", totalBetAmount: total("BET"), totalPayoutAmount: total("WIN") },
  });
}

/** Rolls back accepted and pending bets unless the round has a payout; an unseen bet gets a tombstone. Best effort. */
export async function failRound(round: Round) {
  const bets = await prisma.providerBet.findMany({
    where: { roundId: round.id, status: { in: ["ACCEPTED", "PENDING"] } },
  });
  const paid = bets.some((b) => b.betType === "WIN" && b.status === "ACCEPTED");

  for (const bet of paid ? [] : bets.filter((b) => b.betType === "BET")) {
    await send(round, {
      type: "ROLLBACK",
      transactionId: `rb_${randomUUID()}`,
      amount: Number(bet.amount),
      relatedTransactionId: bet.transactionId,
    }).catch((err: unknown) => round.opts.log?.warn({ err, bet: bet.transactionId }, "refund failed"));
  }

  await prisma.providerGameRound.update({ where: { id: round.id }, data: { status: "FAILED" } });
}
