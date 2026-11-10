import express, { type Request } from "express";

/** express.json that keeps the raw bytes for signature checks. */
export function jsonBody() {
  return express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      (req as Request).rawBody = buf;
    },
  });
}
