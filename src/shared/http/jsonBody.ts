import express, { type Request } from "express";

/** JSON parser that also keeps the raw bytes: signatures are checked against what was sent. */
export function jsonBody() {
  return express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  });
}
