import pino from "pino";
import { config } from "./config";

function canUsePretty(): boolean {
  if (!process.stdout.isTTY) return false;
  try {
    require.resolve("pino-pretty"); // dev-only dependency
    return true;
  } catch {
    return false;
  }
}

/** JSON logs; pretty in a terminal. */
export const logger = pino({
  level: config().LOG_LEVEL,
  transport: canUsePretty() ? { target: "pino-pretty", options: { colorize: true } } : undefined,
});
