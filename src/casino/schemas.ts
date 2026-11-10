import { z } from "zod";

export const ExternalId = z.string().min(1).max(100);

export const SessionFields = z.object({
  sessionToken: z.string().min(1).max(64),
  userId: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const GetBalanceBody = SessionFields;

const Amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const DebitBody = SessionFields.extend({
  transactionId: ExternalId,
  roundId: ExternalId,
  amount: Amount,
});
