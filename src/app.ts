import express from "express";
import { prisma } from "./shared/db/prisma";
import { errorHandler, notFoundHandler } from "./shared/errors/errorHandler";
import { jsonBody } from "./shared/http/jsonBody";
import { requestContext } from "./shared/http/requestContext";

/** Builds the app without listening, so tests can mount it. */
export function createApp() {
  const app = express();

  app.use(requestContext());
  app.use(jsonBody());

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
