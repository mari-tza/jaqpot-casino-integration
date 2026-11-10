import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      /** Exact request bytes, kept for signature verification. */
      rawBody?: Buffer;
      /** From x-request-id, or generated. */
      requestId: string;
      /** Logger bound to this request's id. */
      log: Logger;
    }
  }
}

export {};
