import type { Request, Response } from "express";
import { CreditBody } from "../schemas";
import { resolveSession } from "../services/session.service";
import { credit } from "../services/wallet.service";

export async function creditRoute(req: Request, res: Response) {
  const body = CreditBody.parse(req.body);
  const session = await resolveSession(body.sessionToken, body.userId, body.currency);

  const result = await credit(
    { walletId: session.walletId, sessionId: session.id, roundId: body.roundId, transactionId: body.transactionId },
    BigInt(body.amount),
    body.relatedTransactionId,
  );

  req.log.info({ action: "credit", transactionId: body.transactionId, amount: body.amount, balance: result.balance });
  res.json(result);
}
