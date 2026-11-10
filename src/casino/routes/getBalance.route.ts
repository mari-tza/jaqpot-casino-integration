import type { Request, Response } from "express";
import { GetBalanceBody } from "../schemas";
import { resolveSession } from "../services/session.service";

/** Read-only. */
export async function getBalance(req: Request, res: Response) {
  const { sessionToken, userId, currency } = GetBalanceBody.parse(req.body);
  const session = await resolveSession(sessionToken, userId, currency);

  res.json({ balance: session.wallet.playableBalance.toString(), currency });
}
