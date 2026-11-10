import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 doesn't forward rejected promises to the error handler. */
export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
