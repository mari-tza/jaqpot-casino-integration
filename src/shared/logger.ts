import pino from "pino";
import { config } from "./config";

function canUsePretty(): boolean {
  if (!process.stdout.isTTY) return false;
  try {
    require.resolve("pino-pretty"); // dev dependency, absent in production images
    return true;
  } catch {
    return false;
  }
}

/** JSON logs; human-readable when running in a terminal during development. */
export const logger = pino({
  level: config().LOG_LEVEL,
  transport: canUsePretty() ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});
