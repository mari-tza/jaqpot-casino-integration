import type { Request, Response } from "express";
import { LaunchGameBody } from "../schemas";
import { simulateRound } from "../services/session.service";

/** Test driver: launch + one provider round (unsigned, like launchGame). */
export async function simulateRoundRoute(req: Request, res: Response) {
  const input = LaunchGameBody.parse(req.body);
  const result = await simulateRound(input, req.requestId);

  req.log.info({
    action: "simulate_round",
    userId: input.userId,
    roundId: result.round.roundId,
    finalBalance: result.round.finalBalance,
  });
  res.json(result);
}
