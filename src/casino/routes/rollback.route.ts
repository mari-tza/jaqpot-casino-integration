import type { Request, Response } from "express";
import { RollbackBody } from "../schemas";
import { resolveSession } from "../services/session.service";
import { rollback } from "../services/wallet.service";

export async function rollbackRoute(req: Request, res: Response) {
  const body = RollbackBody.parse(req.body);
  const session = await resolveSession(body.sessionToken, body.userId, body.currency);

  const result = await rollback(
    { walletId: session.walletId, sessionId: session.id, roundId: body.roundId, transactionId: body.transactionId },
    body.relatedTransactionId,
  );

  req.log.info({
    action: "rollback",
    transactionId: body.transactionId,
    bet: body.relatedTransactionId,
    tombstone: result.tombstone,
    balance: result.balance,
  });
  res.json(result);
}
