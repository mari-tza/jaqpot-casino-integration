import { CurrencyMismatchError, SessionNotFoundError, SessionUserMismatchError } from "../errors";
import { findActiveSession, type ActiveSession } from "../repositories/session.repository";

/** The signature proves who sent the call, not which player it may touch. */
export async function resolveSession(token: string, userId: number, currency: string): Promise<ActiveSession> {
  const session = await findActiveSession(token);
  if (!session) throw new SessionNotFoundError();
  if (session.userId !== userId) throw new SessionUserMismatchError();
  if (session.wallet.currencyCode !== currency) throw new CurrencyMismatchError();
  return session;
}
