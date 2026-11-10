import express from "express";

/**
 * Builds the HTTP app without starting a server, so tests can mount it directly.
 * Casino routes will live under /casino/* and provider routes under /provider/*.
 */
export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
