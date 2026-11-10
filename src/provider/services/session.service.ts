import { randomUUID } from "node:crypto";
import { prisma } from "../../shared/db/prisma";
import { CasinoNotRegisteredError, ProviderGameNotFoundError, SessionConflictError } from "../errors";
import type { LaunchInput } from "../schemas";

const GAME_BASE_URL = "https://games.jaqpot.example/play";

/** One provider session per casino session token; a repeated launch returns it. */
export async function launch(input: LaunchInput) {
  const casino = await prisma.providerCasino.findUnique({ where: { casinoCode: input.casinoCode, isActive: true } });
  if (!casino) throw new CasinoNotRegisteredError();

  const game = await prisma.providerGame.findUnique({ where: { gameId: input.gameId, isActive: true } });
  if (!game) throw new ProviderGameNotFoundError();

  const externalUserId = String(input.userId);
  const customer = await prisma.providerCustomer.upsert({
    where: { casinoId_externalUserId: { casinoId: casino.id, externalUserId } },
    update: {},
    create: { casinoId: casino.id, externalUserId, playerId: `plr_${randomUUID()}` },
  });

  const existing = await prisma.providerGameSession.findUnique({
    where: { casinoSessionToken: input.sessionToken },
  });
  const session =
    existing ??
    (await prisma.providerGameSession.create({
      data: {
        providerSessionId: `psess_${randomUUID()}`,
        casinoSessionToken: input.sessionToken,
        customerId: customer.id,
        gameId: game.id,
        currency: input.currency,
      },
    }));

  if (session.customerId !== customer.id || session.gameId !== game.id || session.currency !== input.currency) {
    throw new SessionConflictError();
  }

  return {
    providerSessionId: session.providerSessionId,
    gameUrl: `${GAME_BASE_URL}/${game.gameId}?session=${session.providerSessionId}`,
  };
}
