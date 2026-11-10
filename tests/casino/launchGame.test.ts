import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/shared/db/prisma";
import { casinoPost, resetCasino, userId } from "../helpers/casino";
import { useLiveServer } from "../helpers/liveServer";
import { resetProvider } from "../helpers/provider";

useLiveServer();
afterEach(async () => {
  vi.restoreAllMocks();
  await resetCasino();
  await resetProvider();
});

const app = createApp();
const launch = (body: object, headers: Record<string, string> = {}) =>
  request(app).post("/casino/launchGame").set(headers).send(body);

async function aliceLaunch(overrides: Record<string, unknown> = {}) {
  const game = await prisma.casinoGame.findFirstOrThrow({ where: { providerGameId: "slots-777" } });
  return { userId: await userId("alice"), gameId: game.id, currency: "USD", ...overrides };
}

/** Temporarily changes the provider registry or the game catalog. */
async function withProvider(
  data: { apiEndpoint?: string; secretKey?: string; isDisabled?: boolean },
  fn: () => Promise<void>,
) {
  const before = await prisma.casinoGameProvider.findUniqueOrThrow({ where: { code: "JAQPOT" } });
  await prisma.casinoGameProvider.update({ where: { code: "JAQPOT" }, data });
  try {
    await fn();
  } finally {
    const { apiEndpoint, secretKey, isDisabled } = before;
    await prisma.casinoGameProvider.update({ where: { code: "JAQPOT" }, data: { apiEndpoint, secretKey, isDisabled } });
  }
}

describe("POST /casino/launchGame", () => {
  it("opens linked casino and provider sessions", async () => {
    const res = await launch(await aliceLaunch());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ balance: "100000", currency: "USD" });
    const casino = await prisma.casinoGameSession.findUniqueOrThrow({ where: { token: res.body.sessionToken } });
    const provider = await prisma.providerGameSession.findUniqueOrThrow({
      where: { providerSessionId: res.body.providerSessionId },
    });
    expect(casino).toMatchObject({ isActive: true, providerSessionId: provider.providerSessionId });
    expect(provider.casinoSessionToken).toBe(casino.token);
    expect(res.body.gameUrl).toContain(provider.providerSessionId);
  });

  it("returns a session the provider can use for callbacks", async () => {
    const res = await launch(await aliceLaunch());

    const balance = await casinoPost("/getBalance", {
      sessionToken: res.body.sessionToken,
      userId: await userId("alice"),
      currency: "USD",
    });

    expect(balance.body).toEqual({ balance: "100000", currency: "USD" });
  });

  it("forwards the request id to the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await launch(await aliceLaunch(), { "x-request-id": "trace-launch" });

    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)["x-request-id"]).toBe("trace-launch");
  });

  it.each([
    ["an unknown game", { gameId: 999_999 }, "GAME_NOT_FOUND"],
    ["a currency the player has no wallet in", { currency: "EUR" }, "WALLET_NOT_FOUND"],
    ["an unknown player", { userId: 999_999 }, "WALLET_NOT_FOUND"],
  ])("rejects %s", async (_case, overrides, error) => {
    const res = await launch(await aliceLaunch(overrides));

    expect(res.status).toBe(404);
    expect(res.body.error).toBe(error);
    expect(await prisma.casinoGameSession.count()).toBe(0);
  });

  it("rejects a game whose provider is disabled", async () => {
    await withProvider({ isDisabled: true }, async () => {
      expect((await launch(await aliceLaunch())).status).toBe(404);
    });
  });

  describe("when the provider does not launch", () => {
    async function expectInactiveSession(res: request.Response, providerError?: string) {
      expect(res.status).toBe(502);
      expect(res.body.error).toBe("PROVIDER_ERROR");
      if (providerError) expect(res.body.details.error).toBe(providerError);
      const sessions = await prisma.casinoGameSession.findMany();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.isActive).toBe(false);
    }

    it("deactivates the session when the provider refuses the game", async () => {
      const provider = await prisma.casinoGameProvider.findUniqueOrThrow({ where: { code: "JAQPOT" } });
      const unknown = await prisma.casinoGame.create({
        data: { providerId: provider.id, providerGameId: "not-in-catalog", minBet: 100, maxBet: 1000 },
      });
      try {
        await expectInactiveSession(await launch(await aliceLaunch({ gameId: unknown.id })), "GAME_NOT_FOUND");
      } finally {
        await prisma.casinoGameSession.deleteMany();
        await prisma.casinoGame.delete({ where: { id: unknown.id } });
      }
    });

    it("deactivates the session when the casino signs with the wrong secret", async () => {
      await withProvider({ secretKey: "not-the-provider-secret" }, async () => {
        await expectInactiveSession(await launch(await aliceLaunch()), "INVALID_SIGNATURE");
      });
    });

    it("deactivates the session when the provider is unreachable", async () => {
      await withProvider({ apiEndpoint: "http://127.0.0.1:1/provider" }, async () => {
        await expectInactiveSession(await launch(await aliceLaunch()));
      });
    });
  });

  it("rejects an invalid body", async () => {
    const res = await launch({ userId: "alice", gameId: 1, currency: "USD" });

    expect(res.status).toBe(400);
  });
});
