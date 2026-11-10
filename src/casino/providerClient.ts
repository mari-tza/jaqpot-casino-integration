import { signJson } from "../shared/http/signature";
import { ProviderError } from "./errors";

export interface ProviderTarget {
  apiEndpoint: string;
  secret: string;
}

/** Signed casino → provider call. Any failure becomes a 502 PROVIDER_ERROR. */
export async function callProvider<T>(
  target: ProviderTarget,
  path: string,
  body: object,
  opts: { requestId?: string; timeoutMs?: number } = {},
): Promise<T> {
  const { raw, signature } = signJson(body, target.secret);

  let res: Response;
  try {
    res = await fetch(`${target.apiEndpoint}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-provider-signature": signature,
        ...(opts.requestId && { "x-request-id": opts.requestId }),
      },
      body: raw,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "unreachable";
    throw new ProviderError(`Provider ${path} ${reason}`);
  }

  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
  if (!res.ok) {
    const { error, message, details } = data;
    throw new ProviderError(`Provider ${path} failed with ${res.status}`, {
      status: res.status,
      error,
      message,
      details,
    });
  }
  return data as T;
}
