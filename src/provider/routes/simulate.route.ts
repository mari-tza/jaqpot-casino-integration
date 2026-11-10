import type { Request, Response } from "express";
import { SimulateBody } from "../schemas";
import { simulate } from "../services/simulation.service";

export async function simulateRoute(req: Request, res: Response) {
  const input = SimulateBody.parse(req.body);
  const result = await simulate(input, { requestId: req.requestId, log: req.log });

  req.log.info({ action: "provider_simulate", roundId: result.roundId, finalBalance: result.finalBalance });
  res.json(result);
}
