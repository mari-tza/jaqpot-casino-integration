import express from "express";
import { prisma } from "./shared/db/prisma";
import { errorHandler, notFoundHandler } from "./shared/errors/errorHandler";

/**
 * Builds the HTTP app without starting a server, so tests can mount it directly.
 * Casino routes will live under /casino/* and provider routes under /provider/*.
 */
export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", database: "up" });
    } catch {
      res.status(503).json({ status: "degraded", database: "down" });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
