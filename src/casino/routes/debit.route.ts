import type { Request, Response } from "express";
import { DebitBody } from "../schemas";
import { assertWithinBetLimits, resolveSession } from "../services/session.service";
import { debit } from "../services/wallet.service";

export async function debitRoute(req: Request, res: Response) {
  const body = DebitBody.parse(req.body);
  const session = await resolveSession(body.sessionToken, body.userId, body.currency);
  const amount = BigInt(body.amount);
  assertWithinBetLimits(session, amount);

  const result = await debit(
    { walletId: session.walletId, sessionId: session.id, roundId: body.roundId, transactionId: body.transactionId },
    amount,
  );

  req.log.info({ action: "debit", transactionId: body.transactionId, amount: body.amount, balance: result.balance });
  res.json(result);
}
