import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError, NotFoundError } from "./AppError";

/** Body of every error response. */
export interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new NotFoundError());

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const send = (status: number, body: ErrorBody) => res.status(status).json(body);

  if (err instanceof AppError) {
    return send(err.status, { error: err.code, message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    return send(400, { error: "VALIDATION_ERROR", message: "Invalid request body", details: err.issues });
  }
  // Thrown by express.json() on malformed JSON.
  if (err?.type === "entity.parse.failed") {
    return send(400, { error: "INVALID_JSON", message: "Request body is not valid JSON" });
  }

  // Unexpected: never leak internals to the caller.
  console.error(err);
  return send(500, { error: "INTERNAL_ERROR", message: "Unexpected error" });
};
