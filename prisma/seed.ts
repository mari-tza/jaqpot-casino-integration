/** Dev seed. Safe to re-run: never resets balances. */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const baseUrl = process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const casinoSecret = process.env.CASINO_SECRET ?? "casino-hmac-secret-change-in-production";
const providerSecret = process.env.PROVIDER_SECRET ?? "provider-hmac-secret-change-in-production";

const GAME_ID = "slots-777";
const BET_LIMITS = { minBet: BigInt(100), maxBet: BigInt(100_000) }; // 1.00 – 1,000.00

const PLAYERS = [
  { username: "alice", email: "alice@example.com", balance: BigInt(100_000) }, // 1,000.00 USD
  { username: "bob", email: "bob@example.com", balance: BigInt(50_000) }, //   500.00 USD
];

async function seedCasino() {
  // Casino → provider: endpoint and secret.
  const provider = await prisma.casinoGameProvider.upsert({
    where: { code: "JAQPOT" },
    update: { apiEndpoint: `${baseUrl}/provider`, secretKey: providerSecret },
    create: { code: "JAQPOT", name: "Jaqpot Games", apiEndpoint: `${baseUrl}/provider`, secretKey: providerSecret },
  });

  await prisma.casinoGame.upsert({
    where: { providerId_providerGameId: { providerId: provider.id, providerGameId: GAME_ID } },
    update: {},
    create: { providerId: provider.id, providerGameId: GAME_ID, ...BET_LIMITS },
  });

  for (const p of PLAYERS) {
    const user = await prisma.casinoUser.upsert({
      where: { email: p.email },
      update: {},
      create: { username: p.username, email: p.email },
    });
    await prisma.casinoWallet.upsert({
      where: { userId_currencyCode: { userId: user.id, currencyCode: "USD" } },
      update: {},
      create: { userId: user.id, currencyCode: "USD", playableBalance: p.balance },
    });
  }
}

async function seedProvider() {
  // Provider → casino: endpoint and secret.
  await prisma.providerCasino.upsert({
    where: { casinoCode: "HOUSE" },
    update: { casinoApiEndpoint: `${baseUrl}/casino`, casinoSecret },
    create: { casinoCode: "HOUSE", name: "House Casino", casinoApiEndpoint: `${baseUrl}/casino`, casinoSecret },
  });

  await prisma.providerGame.upsert({
    where: { gameId: GAME_ID },
    update: {},
    create: { gameId: GAME_ID, ...BET_LIMITS },
  });
}

async function main() {
  await seedCasino();
  await seedProvider();
  console.log("Seed complete: alice, bob and game slots-777 (existing balances kept)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
