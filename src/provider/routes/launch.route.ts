import type { Request, Response } from "express";
import { LaunchBody } from "../schemas";
import { launch } from "../services/session.service";

export async function launchRoute(req: Request, res: Response) {
  const input = LaunchBody.parse(req.body);
  const result = await launch(input);

  req.log.info({ action: "provider_launch", providerSessionId: result.providerSessionId, gameId: input.gameId });
  res.json(result);
}
