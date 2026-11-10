import type { Request, Response } from "express";
import { LaunchGameBody } from "../schemas";
import { startGame } from "../services/session.service";

/** Called by the frontend (unsigned; player auth is out of scope). */
export async function launchGame(req: Request, res: Response) {
  const input = LaunchGameBody.parse(req.body);
  const result = await startGame(input, req.requestId);

  req.log.info({
    action: "launch_game",
    userId: input.userId,
    gameId: input.gameId,
    sessionToken: result.sessionToken,
  });
  res.status(201).json(result);
}
