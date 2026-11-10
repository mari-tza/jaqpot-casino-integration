import { randomUUID } from "node:crypto";
import { prisma } from "../../shared/db/prisma";

export function findActiveSession(token: string) {
  return prisma.casinoGameSession.findUnique({
    where: { token, isActive: true },
    include: { wallet: true, game: true },
  });
}

export type ActiveSession = NonNullable<Awaited<ReturnType<typeof findActiveSession>>>;

export function findLaunchableGame(gameId: number) {
  return prisma.casinoGame.findFirst({
    where: { id: gameId, isActive: true, provider: { isDisabled: false } },
    include: { provider: true },
  });
}

export function findWallet(userId: number, currencyCode: string) {
  return prisma.casinoWallet.findUnique({ where: { userId_currencyCode: { userId, currencyCode } } });
}

export function createSession(data: { userId: number; walletId: number; gameId: number }) {
  return prisma.casinoGameSession.create({ data: { ...data, token: randomUUID() } });
}

export function linkProviderSession(id: number, providerSessionId: string) {
  return prisma.casinoGameSession.update({ where: { id }, data: { providerSessionId } });
}

export function deactivateSession(id: number) {
  return prisma.casinoGameSession.update({ where: { id }, data: { isActive: false } });
}
