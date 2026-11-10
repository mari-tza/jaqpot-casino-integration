import type { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      /** Raw bytes, for signature checks. */
      rawBody?: Buffer;
      requestId: string;
      log: Logger;
    }
  }
}

export {};
