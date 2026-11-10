/**
 * Sends a signed request by hand.
 * Usage: npm run call -- /casino/getBalance '{"sessionToken":"…","userId":1,"currency":"USD"}' [--url http://…] [--curl]
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { signedRequest } from "./lib/signedRequest";

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { url: { type: "string" }, curl: { type: "boolean", default: false } },
});

const [path, json = "{}"] = positionals;
const baseUrl = args.url ?? process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

async function main() {
  if (!path) {
    console.error("Usage: npm run call -- <path> '<json body>' [--url http://…] [--curl]");
    process.exit(1);
  }

  const { raw, headers } = signedRequest(path, JSON.parse(json));
  const url = `${baseUrl}${path}`;

  if (args.curl) {
    const flags = Object.entries(headers).map(([k, v]) => `-H '${k}: ${v}'`);
    console.log(`curl -s -X POST ${url} ${flags.join(" ")} -d '${raw}'`);
    return;
  }

  const res = await fetch(url, { method: "POST", headers, body: raw });
  console.log(res.status, JSON.stringify(await res.json(), null, 2));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
