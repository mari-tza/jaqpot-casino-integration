import { config } from "../../shared/config";
import {
  BetLimitError,
  CurrencyMismatchError,
  GameNotFoundError,
  SessionNotFoundError,
  SessionUserMismatchError,
  WalletNotFoundError,
} from "../errors";
import { callProvider, type ProviderTarget } from "../providerClient";
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
  return (await openGame(input, requestId)).launched;
}

export interface ProviderRound {
  roundId: string;
  status: string;
  startingBalance: string;
  finalBalance: string;
  steps: object[];
}

/** Launch, then ask the provider to play one scripted round on that session. */
export async function simulateRound(input: LaunchGameInput, requestId?: string) {
  const { provider, launched } = await openGame(input, requestId);

  const round = await callProvider<ProviderRound>(
    provider,
    "/simulate",
    {
      providerSessionId: launched.providerSessionId,
      sessionToken: launched.sessionToken,
      userId: input.userId,
      currency: input.currency,
      casinoCode: config().CASINO_CODE,
    },
    { requestId, timeoutMs: 30_000 },
  );

  return { ...launched, round };
}

async function openGame(input: LaunchGameInput, requestId?: string) {
  const game = await findLaunchableGame(input.gameId);
  if (!game) throw new GameNotFoundError();

  const wallet = await findWallet(input.userId, input.currency);
  if (!wallet) throw new WalletNotFoundError();

  const provider: ProviderTarget = { apiEndpoint: game.provider.apiEndpoint, secret: game.provider.secretKey };
  const session = await createSession({ userId: input.userId, walletId: wallet.id, gameId: game.id });

  let launched: { providerSessionId: string; gameUrl: string };
  try {
    launched = await callProvider(
      provider,
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
    provider,
    launched: {
      sessionToken: session.token,
      providerSessionId: launched.providerSessionId,
      gameUrl: launched.gameUrl,
      balance: wallet.playableBalance.toString(),
      currency: input.currency,
    },
  };
}
