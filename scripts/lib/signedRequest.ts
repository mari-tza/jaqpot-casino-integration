import { signJson } from "../../src/shared/http/signature";

// The header and secret belong to the receiving system.
const RECEIVERS = {
  casino: { header: "x-casino-signature", secret: "CASINO_SECRET" },
  provider: { header: "x-provider-signature", secret: "PROVIDER_SECRET" },
} as const;

/** Body bytes and headers for a signed call to /casino/… or /provider/…. */
export function signedRequest(path: string, body: object, env: NodeJS.ProcessEnv = process.env) {
  const receiver = path.split("/")[1];
  if (receiver !== "casino" && receiver !== "provider") {
    throw new Error(`Path must start with /casino/ or /provider/, got ${path}`);
  }

  const { header, secret } = RECEIVERS[receiver];
  const key = env[secret];
  if (!key) throw new Error(`${secret} is not set`);

  const { raw, signature } = signJson(body, key);
  return { raw, headers: { "content-type": "application/json", [header]: signature } };
}
