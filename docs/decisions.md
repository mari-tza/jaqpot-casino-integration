# Decision log

Short records of technical decisions: the context, what was chosen and why.
New entries are added in the pull request that makes the decision.

## D1 — One codebase and one process, two logical systems

**Context.** The test allows the casino and the provider to share a codebase and a
database, as long as they stay logically separated.

**Decision.** Run both in one Express app. Casino code lives in `src/casino`,
provider code in `src/provider`, shared plumbing in `src/shared`. The two domains
never import each other's modules and never touch each other's tables. They call
each other over HTTP, with signatures, even though it is the same process.

**Why.** Keeps setup to one service while keeping the trust boundary real: every
cross-system call goes through the same path (HTTP, HMAC, idempotency) it would
take if the systems were deployed apart.

## D2 — Stack

**Decision.** Node.js 20, TypeScript (strict), Express 4, PostgreSQL 16, Prisma 5,
Vitest + supertest, ESLint + Prettier, GitHub Actions.

**Why.** Matches the test's requirements (Node 18+, PostgreSQL, Express, an ORM) with
well-known tools. Prisma gives typed queries and versioned migrations; raw SQL is
still available where row locking needs it.

## D3 — Table prefixes in lower case

**Context.** The test asks for tables prefixed `CASINO_*` and `PROVIDER_*`.

**Decision.** Use `casino_*` and `provider_*` (Prisma models mapped with `@@map`).

**Why.** PostgreSQL folds unquoted identifiers to lower case, so upper-case names
would have to be quoted in every raw query (`"CASINO_WALLETS"`), and raw SQL is
needed for row locking. Lower case keeps the same separation and is idiomatic.

## D4 — Money as integer minor units

**Decision.** Store amounts and balances as `BIGINT` cents; return them as strings in JSON.

**Why.** No floating-point rounding, exact sums, and `BIGINT` does not overflow at
casino scale. Strings in JSON avoid precision loss in JavaScript clients.

## D5 — Business invariants also enforced by the database

**Decision.** Beyond `UNIQUE` and foreign keys, the initial migration adds CHECK
constraints: non-negative balances and amounts, valid bet limits, allowed
transaction types and statuses.

**Why.** The application enforces these rules, but a bug or a manual query must not
be able to create a negative balance. CI also fails when `schema.prisma` and the
migrations drift apart, since hand-written SQL is easy to forget.

## D6 — Extra tables beyond the minimum schema

**Decision.** Add `provider_casinos` (casino registry: callback URL and secret) and
`provider_game_sessions` (sessions created by `/provider/launch`). Rounds point to
the session by foreign key instead of storing the session id as text.

**Why.** The provider needs to know where and how to call the casino back, and
`/provider/simulate` must confirm that the session it receives was really created
by `/provider/launch` for that player.

## D7 — Signatures cover the raw request bytes

**Context.** The spec signs `JSON.stringify(body)` with HMAC-SHA256, one secret and
header per direction.

**Decision.** Senders serialize once and send exactly the bytes they signed. Receivers
verify against the raw body captured by the JSON parser, not a re-serialization of
the parsed object. Comparison is constant-time; an empty secret never validates; the
server does not start without both secrets.

**Why.** Re-serializing on the receiver only works if both sides produce byte-identical
JSON. Key order or whitespace from a different client would break verification. Signing
`JSON.stringify(body)` and sending that string stays compatible with the spec's snippet.

**Not added.** A timestamp or nonce in the signature would block replays, but it changes
the signing scheme defined by the spec. Replays of money calls are already harmless:
every debit, credit and rollback is idempotent by `transactionId` (M3).

## D8 — One error format

**Decision.** Every error response is `{ "error": CODE, "message": text, "details"?: … }`
with a stable upper-case code. Validation errors are 400, signature errors 401,
business rule rejections 409/422, unexpected errors 500 with a generic message.

**Why.** The provider decides whether to retry from the status and code, so they must be
predictable. Internal messages of unexpected errors never reach the caller.

## D9 — Request ids across both systems

**Decision.** Each request gets an id from `x-request-id` (if well-formed) or a new UUID.
It is returned in the response, attached to every log line, and forwarded on casino ↔
provider calls.

**Why.** One simulated round crosses both systems several times; a shared id makes the
whole round traceable in the logs.

## D10 — Lock the wallet, then check idempotency

**Decision.** Every debit and credit runs in one database transaction that starts with
`SELECT … FROM casino_wallets WHERE id = $1 FOR UPDATE`. The `transactionId` lookup,
the business rules, the balance update and the ledger insert all happen under that lock.

**Why.** Checking for a duplicate before taking the lock lets two concurrent copies of
the same request both pass the check. Under the lock, the second copy waits, then finds
the first one's row and replays its response. The `UNIQUE` constraint stays as a safety
net for the same id arriving on two different wallets.

## D11 — Store successes, not failures

**Decision.** `response_cache` holds the first successful response. A request that failed
(insufficient funds, limits) leaves no row, so a retry is evaluated again. A retry whose
payload differs from the stored one (type, amount, wallet, round or bet) gets
`409 IDEMPOTENCY_CONFLICT` instead of the cached answer.

**Why.** The spec asks to store the first successful result. Caching failures would
keep rejecting a bet even after the player deposits. Answering a different payload with
someone else's cached result would hide a provider bug.

## D12 — Payouts point at a bet

**Decision.** A credit must reference (`relatedTransactionId`) an accepted debit on the
same wallet and round. Zero payouts are accepted.

**Why.** The spec asks for credits linked to their round and bet. Rejecting a payout for a
bet the casino never accepted stops money from being created out of nothing. Zero
payouts are how providers usually close a lost round.

## D13 — Rollback rules

**Decision.** `POST /casino/rollback` runs on the same lock-then-check path as debit and credit:

| Case | Result |
|---|---|
| Bet unknown | Tombstone: zero-amount ROLLBACK row, `tombstone: true`, balance unchanged |
| Bet arrives after its tombstone | Debit rejected, `409 BET_ALREADY_ROLLED_BACK` |
| Target is a payout | `409` — only bets can be rolled back |
| Round already has a payout (even 0) | `409` |
| Bet already rolled back (new rollback id) | `409`; the same id replays |
| Bet on another wallet or round | `409` |
| Payout for a rolled-back bet | `409 CREDIT_NOT_ALLOWED` |

**Why.** The spec's rules plus the cases that would otherwise move money twice: a
double refund, a refund followed by a payout, or a cancelled bet charged later. The
tombstone answers success so the provider stops retrying, and leaves an audit row.

## D14 — Launch: casino session first, provider second

**Decision.** `POST /casino/launchGame` creates the casino session, then calls
`/provider/launch`. If the provider refuses, fails or times out (10 s), the casino
session is deactivated and the call returns `502 PROVIDER_ERROR` with the provider's
status and code. The endpoint is unsigned: it is called by the frontend, and player
authentication is out of scope for this test.

**Why.** The provider needs the casino session token to call back, so the casino session
must exist first. Deactivating it on failure means a half-launched session can never
receive money callbacks.

## D15 — Provider launch is idempotent per casino session

**Decision.** The provider stores one session per casino session token. A repeated launch
with the same token, player, game and currency returns the same session; any other
combination is `409 SESSION_CONFLICT`.

**Why.** The casino may retry a launch after a timeout. Creating a second provider session
for the same casino session would leave two sessions able to play on one wallet.

## D16 — Provider retries with the same bytes

**Decision.** The provider retries a casino call twice (200 ms, then 400 ms) after a
network error, a timeout (5 s) or a 5xx, sending the same body and signature. A 4xx is
the casino's decision and is not retried. After the last attempt the call fails with
`502 CASINO_UNAVAILABLE`.

**Why.** A timeout does not say whether the casino applied the call. Resending the same
`transactionId` is safe because the casino replays its first answer (D10, D11), so the
provider can always retry instead of guessing.

## D17 — Provider records each call before sending it

**Decision.** Every money call is written to `provider_bets` as `PENDING` first, then
updated to `ACCEPTED` (with the casino's balance and answer) or `FAILED` (with the
casino's error). A rolled back bet is marked `ROLLED_BACK`. If a call fails mid-round,
the round is `FAILED` and its accepted and `PENDING` bets are rolled back, unless the
round already has a payout.

**Why.** A `PENDING` row is a call with an unknown outcome: the casino may have applied
it without answering. Rolling it back is safe either way: the casino refunds it, or
records a tombstone and refuses the bet if it arrives later (D13). Refunding a failed
round keeps the player from losing a bet for a round that never finished. Rows stay
`PENDING` only if the casino is still down for the rollback.

## D18 — Scripted round

**Decision.** `/provider/simulate` plays, on the launched session:

| Step | Call | Balance (from 1,000.00) |
|---|---|---|
| Balance check | `getBalance` | 1,000.00 |
| Bet A, 10.00 | `debit` | 990.00 |
| Bet B, 5.00 | `debit` | 985.00 |
| Bet A again, same id | `debit` | 990.00 (first answer replayed, nothing charged) |
| Roll back bet B | `rollback` | 990.00 |
| Pay 25.00 on bet A | `credit` | 1,015.00 |
| Balance check | `getBalance` | 1,015.00 |

Every run uses new round and transaction ids. Before playing, the provider checks that
the casino code, session token, player and currency all match the launched session
(`403 SESSION_MISMATCH` otherwise).

**Why.** Covers what the spec asks for (balance, bets, a payout, a rollback) plus a
duplicate, to show idempotency end to end. The rollback comes before the payout because a
paid round cannot be rolled back (D13). New ids per run make re-running play a new round,
while a resend inside a run is the case idempotency must absorb.

## D19 — The container migrates and seeds on start

**Decision.** The image runs `prisma migrate deploy`, the seed, then the server.
`docker compose up` waits for PostgreSQL to be healthy first. The image keeps the dev
dependencies (Prisma CLI, tsx) so the same container can run `npm run simulate`.

**Why.** One command from a clean clone to a played round, without Node on the host.
Both steps are idempotent, so restarts are safe. A production image would be
multi-stage without dev dependencies, and run migrations as a separate release step.
