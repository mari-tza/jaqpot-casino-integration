import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { logger as rootLogger } from "../logger";

const SAFE_ID = /^[\w.:-]{1,100}$/;

/**
 * Gives every request an id (reused from x-request-id when it looks safe),
 * a child logger that carries it, and one log line when the response is sent.
 * The id is echoed back and forwarded on casino ↔ provider calls.
 */
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
