import { randomUUID } from "node:crypto";
import { casinoPost, openSession, type Player } from "./casino";

/** Provider-side view of one round: signed calls sharing session and round id. */
export async function round(player: Player = "alice", roundId = `round_${randomUUID()}`) {
  const s = await openSession(player);
  const base = { sessionToken: s.token, userId: s.userId, currency: "USD", roundId };
  return {
    roundId,
    bet: (transactionId: string, amount: number) => casinoPost("/debit", { ...base, transactionId, amount }),
    win: (transactionId: string, amount: number, bet: string) =>
      casinoPost("/credit", { ...base, transactionId, amount, relatedTransactionId: bet }),
    rollback: (bet: string, transactionId = `rb_${randomUUID()}`) =>
      casinoPost("/rollback", { ...base, transactionId, relatedTransactionId: bet }),
    /** Same session, another round. */
    inRound: (otherRoundId: string) => ({
      rollback: (bet: string) =>
        casinoPost("/rollback", {
          ...base,
          roundId: otherRoundId,
          transactionId: `rb_${randomUUID()}`,
          relatedTransactionId: bet,
        }),
    }),
  };
}
