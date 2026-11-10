declare global {
  namespace Express {
    interface Request {
      /** Exact request bytes, kept for signature verification. */
      rawBody?: Buffer;
    }
  }
}

export {};
