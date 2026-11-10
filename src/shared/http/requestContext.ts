import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { logger as rootLogger } from "../logger";

const SAFE_ID = /^[\w.:-]{1,100}$/;

/** Request id (from x-request-id or new), a logger bound to it, one log line per request. */
export function requestContext(logger: Logger = rootLogger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();

    req.requestId = requestId;
    req.log = logger.child({ requestId });
    res.setHeader("x-request-id", requestId);

    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      req.log.info(
        { method: req.method, path: req.originalUrl, status: res.statusCode, durationMs },
        "request completed",
      );
    });

    next();
  };
}
