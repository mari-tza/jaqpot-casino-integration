import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../../src/app";
import { config } from "../../src/shared/config";
import { prisma } from "../../src/shared/db/prisma";
import { signJson } from "../../src/shared/http/signature";

const app = createApp();

/** Signed provider → casino call. */
export function casinoPost(path: string, body: object) {
  const { raw, signature } = signJson(body, config().CASINO_SECRET);
  return request(app)
    .post(`/casino${path}`)
    .set("content-type", "application/json")
    .set("x-casino-signature", signature)
    .send(raw);
}

export const SEED_BALANCES = { alice: BigInt(100_000), bob: BigInt(50_000) } as const;
export type Player = keyof typeof SEED_BALANCES;

export async function userId(player: Player) {
  return (await prisma.casinoUser.findUniqueOrThrow({ where: { username: player } })).id;
}

/** Opens a session directly, without calling the provider. */
export async function openSession(player: Player, opts: { isActive?: boolean } = {}) {
  const wallet = await prisma.casinoWallet.findFirstOrThrow({ where: { user: { username: player } } });
  const game = await prisma.casinoGame.findFirstOrThrow();
  const session = await prisma.casinoGameSession.create({
    data: { token: randomUUID(), userId: wallet.userId, walletId: wallet.id, gameId: game.id, ...opts },
  });
  return { token: session.token, userId: wallet.userId, walletId: wallet.id };
}

export async function balanceOf(player: Player) {
  const wallet = await prisma.casinoWallet.findFirstOrThrow({ where: { user: { username: player } } });
  return wallet.playableBalance;
}

/** Back to the seed state. */
export async function resetCasino() {
  await prisma.casinoTransaction.deleteMany();
  await prisma.casinoGameSession.deleteMany();
  for (const [player, balance] of Object.entries(SEED_BALANCES)) {
    await prisma.casinoWallet.updateMany({ where: { user: { username: player } }, data: { playableBalance: balance } });
  }
}
