import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/shared/db/prisma";

/**
 * Casino and provider talk over HTTP using the endpoints in their registries.
 * Starts the app on a random port and points both registries at it for this file.
 */
export function useLiveServer() {
  let server: Server;
  let original: { provider: string; casino: string };

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const s = createApp().listen(0, () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const provider = await prisma.casinoGameProvider.findUniqueOrThrow({ where: { code: "JAQPOT" } });
    const casino = await prisma.providerCasino.findUniqueOrThrow({ where: { casinoCode: "HOUSE" } });
    original = { provider: provider.apiEndpoint, casino: casino.casinoApiEndpoint };

    await prisma.casinoGameProvider.update({ where: { code: "JAQPOT" }, data: { apiEndpoint: `${base}/provider` } });
    await prisma.providerCasino.update({
      where: { casinoCode: "HOUSE" },
      data: { casinoApiEndpoint: `${base}/casino` },
    });
  });

  afterAll(async () => {
    await prisma.casinoGameProvider.update({ where: { code: "JAQPOT" }, data: { apiEndpoint: original.provider } });
    await prisma.providerCasino.update({
      where: { casinoCode: "HOUSE" },
      data: { casinoApiEndpoint: original.casino },
    });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
}
