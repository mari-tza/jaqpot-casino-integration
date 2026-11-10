import { randomUUID } from "node:crypto";
import { CasinoRejection, type CallOptions } from "../casinoClient";
import { RoundFailedError } from "../errors";
import type { SimulateInput } from "../schemas";
import { closeRound, failRound, getBalance, openRound, send, type Call, type Round } from "./round.service";
import { resolveSession } from "./session.service";

const BET_A = 1000;
const BET_B = 500;
const PAYOUT = 2500;

export interface Step {
  step: "balance" | "bet" | "duplicate_bet" | "rollback" | "win";
  balance: string;
  transactionId?: string;
  relatedTransactionId?: string;
  amount?: number;
  replayed?: boolean;
}

const newId = (prefix: string) => `${prefix}_${randomUUID()}`;

/**
 * Scripted round: balance, two bets, a resent bet, a rollback, a payout, balance.
 * The rollback comes before the payout because a paid round cannot be rolled back.
 * Fresh ids on every run, so re-running plays a new round.
 */
export async function simulate(input: SimulateInput, opts: CallOptions = {}) {
  const session = await resolveSession(input);
  const round = await openRound(session, opts);
  const steps: Step[] = [];
  let current: Step["step"] = "balance";

  const money = async (step: Step["step"], call: Call) => {
    current = step;
    const res = await send(round, call);
    const related = "relatedTransactionId" in call ? call.relatedTransactionId : undefined;
    steps.push({
      step,
      transactionId: call.transactionId,
      relatedTransactionId: related,
      amount: call.amount,
      balance: res.balance,
    });
    return res;
  };

  try {
    const start = await getBalance(round);
    steps.push({ step: "balance", balance: start.balance });

    const betA = newId("bet");
    const betB = newId("bet");
    const first = await money("bet", { type: "BET", transactionId: betA, amount: BET_A });
    await money("bet", { type: "BET", transactionId: betB, amount: BET_B });

    // Same id as bet A: the casino must answer with the first result and not charge again.
    const resent = await money("duplicate_bet", { type: "BET", transactionId: betA, amount: BET_A });
    steps[steps.length - 1]!.replayed = resent.balance === first.balance;

    await money("rollback", {
      type: "ROLLBACK",
      transactionId: newId("rb"),
      amount: BET_B,
      relatedTransactionId: betB,
    });
    await money("win", { type: "WIN", transactionId: newId("win"), amount: PAYOUT, relatedTransactionId: betA });

    current = "balance";
    const end = await getBalance(round);
    steps.push({ step: "balance", balance: end.balance });

    const closed = await closeRound(round);
    return {
      roundId: round.roundId,
      status: closed.status,
      startingBalance: start.balance,
      finalBalance: end.balance,
      totalBet: closed.totalBetAmount.toString(),
      totalPayout: closed.totalPayoutAmount.toString(),
      steps,
    };
  } catch (err) {
    throw await fail(round, current, err);
  }
}

async function fail(round: Round, step: string, err: unknown) {
  await failRound(round);
  const rejected = err instanceof CasinoRejection;
  const reason = rejected
    ? { casinoStatus: err.status, casinoError: err.body.error }
    : { error: err instanceof Error ? err.message : String(err) };
  round.opts.log?.warn({ roundId: round.roundId, step, ...reason }, "round failed");

  if (!rejected) return err;
  return new RoundFailedError({ roundId: round.roundId, step, casinoStatus: err.status, casinoError: err.body.error });
}
