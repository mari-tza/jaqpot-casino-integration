/** Runs POST /casino/simulateRound and prints the round. Usage: npm run simulate -- [--user 1] [--url http://…] */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    user: { type: "string", default: "1" },
    game: { type: "string", default: "1" },
    currency: { type: "string", default: "USD" },
    url: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const baseUrl = args.url ?? process.env.BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

interface Step {
  step: string;
  balance: string;
  transactionId?: string;
  relatedTransactionId?: string;
  amount?: number;
  replayed?: boolean;
}

const money = (cents: string | number) =>
  (Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// bet_3f2a9c1e-… → bet_3f2a9c1e
const shortId = (id?: string) => id?.replace(/^(\w+?_[0-9a-f]{8}).*$/, "$1") ?? "";

async function main() {
  const requestId = `sim-${randomUUID()}`;
  const body = { userId: Number(args.user), gameId: Number(args.game), currency: args.currency };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/casino/simulateRound`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      body: JSON.stringify(body),
    });
  } catch {
    console.error(`Could not reach ${baseUrl}. Is the server running?`);
    process.exit(1);
  }

  const data = await res.json();
  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
  }
  if (!res.ok) {
    console.error(`simulateRound failed: ${res.status} ${data.error}: ${data.message}`);
    if (data.details) console.error(JSON.stringify(data.details));
    process.exit(1);
  }
  if (args.json) return;

  const { round } = data;
  console.log(`\nRound ${round.roundId} · ${round.status} · request id ${requestId}\n`);
  console.log(`  ${"step".padEnd(15)}${"transaction".padEnd(30)}${"amount".padStart(10)}${"balance".padStart(12)}`);
  for (const s of round.steps as Step[]) {
    const tx = s.relatedTransactionId
      ? `${shortId(s.transactionId)} → ${shortId(s.relatedTransactionId)}`
      : shortId(s.transactionId);
    const amount = s.amount === undefined ? "" : money(s.amount);
    const note = s.replayed ? "  replayed, not charged" : "";
    console.log(`  ${s.step.padEnd(15)}${tx.padEnd(30)}${amount.padStart(10)}${money(s.balance).padStart(12)}${note}`);
  }
  console.log(`\nBalance ${money(round.startingBalance)} → ${money(round.finalBalance)} ${data.currency}\n`);
}

void main();
