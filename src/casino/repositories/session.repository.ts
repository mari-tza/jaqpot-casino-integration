import { prisma } from "../../shared/db/prisma";

export function findActiveSession(token: string) {
  return prisma.casinoGameSession.findUnique({
    where: { token, isActive: true },
    include: { wallet: true, game: true },
  });
}

export type ActiveSession = NonNullable<Awaited<ReturnType<typeof findActiveSession>>>;
