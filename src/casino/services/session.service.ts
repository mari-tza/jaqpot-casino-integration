import { config } from "../../shared/config";
import {
  BetLimitError,
  CurrencyMismatchError,
  GameNotFoundError,
  SessionNotFoundError,
  SessionUserMismatchError,
  WalletNotFoundError,
} from "../errors";
import { callProvider } from "../providerClient";
import {
  createSession,
  deactivateSession,
  findActiveSession,
  findLaunchableGame,
  findWallet,
  linkProviderSession,
  type ActiveSession,
} from "../repositories/session.repository";
import type { LaunchGameInput } from "../schemas";

/** The signature proves who sent the call, not which player it may touch. */
export async function resolveSession(token: string, userId: number, currency: string): Promise<ActiveSession> {
  const session = await findActiveSession(token);
  if (!session) throw new SessionNotFoundError();
  if (session.userId !== userId) throw new SessionUserMismatchError();
  if (session.wallet.currencyCode !== currency) throw new CurrencyMismatchError();
  return session;
}

export function assertWithinBetLimits(session: ActiveSession, amount: bigint) {
  const { minBet, maxBet } = session.game;
  if (amount < minBet || amount > maxBet) throw new BetLimitError(minBet, maxBet);
}

/** Casino session → provider /launch → link both. A refused launch leaves the session inactive. */
export async function startGame(input: LaunchGameInput, requestId?: string) {
  const game = await findLaunchableGame(input.gameId);
  if (!game) throw new GameNotFoundError();

  const wallet = await findWallet(input.userId, input.currency);
  if (!wallet) throw new WalletNotFoundError();

  const session = await createSession({ userId: input.userId, walletId: wallet.id, gameId: game.id });

  let launched: { providerSessionId: string; gameUrl: string };
  try {
    launched = await callProvider(
      { apiEndpoint: game.provider.apiEndpoint, secret: game.provider.secretKey },
      "/launch",
      {
        sessionToken: session.token,
        userId: input.userId,
        gameId: game.providerGameId,
        currency: input.currency,
        casinoCode: config().CASINO_CODE,
      },
      { requestId },
    );
  } catch (err) {
    await deactivateSession(session.id);
    throw err;
  }

  await linkProviderSession(session.id, launched.providerSessionId);

  return {
    sessionToken: session.token,
    providerSessionId: launched.providerSessionId,
    gameUrl: launched.gameUrl,
    balance: wallet.playableBalance.toString(),
    currency: input.currency,
  };
}
