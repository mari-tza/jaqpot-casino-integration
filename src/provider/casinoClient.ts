import type { Logger } from "pino";
import { signJson } from "../shared/http/signature";
import { CasinoUnavailableError } from "./errors";

export interface CasinoTarget {
  casinoApiEndpoint: string;
  casinoSecret: string;
}

export interface CallOptions {
  requestId?: string;
  log?: Logger;
  retries?: number;
  timeoutMs?: number;
  backoffMs?: number;
}

/** The casino answered 4xx: a decision, so it is not retried. */
export class CasinoRejection extends Error {
  constructor(
    readonly status: number,
    readonly body: { error?: string; message?: string },
  ) {
    super(`Casino rejected the call: ${status} ${body.error ?? ""}`.trim());
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Signed provider → casino call. Network errors, timeouts and 5xx are retried with
 * the same bytes, so the casino sees the same transactionId and replays.
 */
export async function callCasino<T>(
  target: CasinoTarget,
  path: string,
  body: object,
  { requestId, log, retries = 2, timeoutMs = 5_000, backoffMs = 200 }: CallOptions = {},
): Promise<T> {
  const { raw, signature } = signJson(body, target.casinoSecret);

  for (let attempt = 1; ; attempt++) {
    let reason: string;
    try {
      const res = await fetch(`${target.casinoApiEndpoint}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-casino-signature": signature,
          ...(requestId && { "x-request-id": requestId }),
        },
        body: raw,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500) {
        const body = (await res.json().catch(() => ({}))) as CasinoRejection["body"];
        throw new CasinoRejection(res.status, body);
      }
      reason = `failed with ${res.status}`;
    } catch (err) {
      if (err instanceof CasinoRejection) throw err;
      reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    }

    if (attempt > retries) throw new CasinoUnavailableError(path, attempt, reason);
    log?.warn({ path, attempt, reason }, "retrying casino call");
    await sleep(backoffMs * attempt);
  }
}
