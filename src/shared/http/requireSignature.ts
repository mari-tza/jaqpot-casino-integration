import type { RequestHandler } from "express";
import { config } from "../config";
import { InvalidSignatureError } from "../errors/AppError";
import { verify } from "./signature";

/** 401 unless `header` is a valid HMAC of the raw body. */
function requireSignature(header: string, secret: () => string): RequestHandler {
  return (req, _res, next) => {
    const ok = verify(req.header(header), req.rawBody ?? Buffer.alloc(0), secret());
    next(ok ? undefined : new InvalidSignatureError());
  };
}

/** Provider → casino. */
export const requireCasinoSignature = requireSignature("x-casino-signature", () => config().CASINO_SECRET);

/** Casino → provider. */
export const requireProviderSignature = requireSignature("x-provider-signature", () => config().PROVIDER_SECRET);
