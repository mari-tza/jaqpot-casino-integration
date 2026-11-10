import { randomUUID } from "node:crypto";
import { prisma } from "../../shared/db/prisma";
import {
  CasinoNotRegisteredError,
  ProviderGameNotFoundError,
  ProviderSessionNotFoundError,
  SessionConflictError,
  SessionMismatchError,
} from "../errors";
import type { LaunchInput, SimulateInput } from "../schemas";
import type { RoundSession } from "./round.service";

const GAME_BASE_URL = "https://games.jaqpot.example/play";

/** One provider session per casino session token; a repeated launch returns it. */
export async function launch(input: LaunchInput) {
  const casino = await prisma.providerCasino.findUnique({ where: { casinoCode: input.casinoCode, isActive: true } });
  if (!casino) throw new CasinoNotRegisteredError();

  const game = await prisma.providerGame.findUnique({ where: { gameId: input.gameId, isActive: true } });
  if (!game) throw new ProviderGameNotFoundError();

  // Insert-if-missing (ON CONFLICT DO NOTHING), then read: concurrent launches can't hit the UNIQUE.
  const externalUserId = String(input.userId);
  await prisma.providerCustomer.createMany({
    data: { casinoId: casino.id, externalUserId, playerId: `plr_${randomUUID()}` },
    skipDuplicates: true,
  });
  const customer = await prisma.providerCustomer.findUniqueOrThrow({
    where: { casinoId_externalUserId: { casinoId: casino.id, externalUserId } },
  });

  await prisma.providerGameSession.createMany({
    data: {
      providerSessionId: `psess_${randomUUID()}`,
      casinoSessionToken: input.sessionToken,
      customerId: customer.id,
      gameId: game.id,
      currency: input.currency,
    },
    skipDuplicates: true,
  });
  const session = await prisma.providerGameSession.findUniqueOrThrow({
    where: { casinoSessionToken: input.sessionToken },
  });

  if (session.customerId !== customer.id || session.gameId !== game.id || session.currency !== input.currency) {
    throw new SessionConflictError();
  }

  return {
    providerSessionId: session.providerSessionId,
    gameUrl: `${GAME_BASE_URL}/${game.gameId}?session=${session.providerSessionId}`,
  };
}

/** Every identifier the casino sends must match the launched session. */
export async function resolveSession(input: SimulateInput): Promise<RoundSession> {
  const session = await prisma.providerGameSession.findUnique({
    where: { providerSessionId: input.providerSessionId },
    include: { customer: { include: { casino: true } }, game: true },
  });
  if (!session?.isActive || !session.game.isActive) throw new ProviderSessionNotFoundError();

  const { casino } = session.customer;
  const matches =
    casino.isActive &&
    casino.casinoCode === input.casinoCode &&
    session.casinoSessionToken === input.sessionToken &&
    session.customer.externalUserId === String(input.userId) &&
    session.currency === input.currency;
  if (!matches) throw new SessionMismatchError();

  return session;
}
