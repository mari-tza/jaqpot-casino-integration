import { z } from "zod";

export const LaunchBody = z.object({
  sessionToken: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  gameId: z.string().min(1).max(100),
  currency: z.string().regex(/^[A-Z]{3}$/),
  casinoCode: z.string().min(1).max(50),
});
export type LaunchInput = z.infer<typeof LaunchBody>;

export const SimulateBody = LaunchBody.omit({ gameId: true }).extend({
  providerSessionId: z.string().min(1).max(100),
});
export type SimulateInput = z.infer<typeof SimulateBody>;
