import type { RequestHandler } from "express";
import { config } from "../config";
import { InvalidSignatureError } from "../errors/AppError";
import { verify } from "./signature";

/**
 * Rejects the request unless `header` holds a valid HMAC of the raw body.
 * The header names the receiving system, and each direction has its own secret.
 */
function requireSignature(header: string, secret: () => string): RequestHandler {
  return (req, _res, next) => {
    const ok = verify(req.header(header), req.rawBody ?? Buffer.alloc(0), secret());
    next(ok ? undefined : new InvalidSignatureError());
  };
}

/** Provider → casino callbacks. */
export const requireCasinoSignature = requireSignature("x-casino-signature", () => config().CASINO_SECRET);

/** Casino → provider calls. */
export const requireProviderSignature = requireSignature("x-provider-signature", () => config().PROVIDER_SECRET);
