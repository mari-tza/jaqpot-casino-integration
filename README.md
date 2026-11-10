# Jaqpot Casino Integration

Backend technical test: an online casino platform and an external game provider
(Jaqpot) integrated through signed HTTP callbacks.

- **Casino platform** — owns player wallets, validates bets and is the source of truth for balances.
- **Game provider** — runs game rounds and moves money only by calling the casino.

Both run in one process and one PostgreSQL database, logically separated: `/casino/*` and
`/provider/*` routes, `casino_*` and `provider_*` tables, and they only talk over HTTP with
HMAC signatures. How it was built, milestone by milestone: [PLAN.md](PLAN.md).

## Quick start

Requirements: Docker. One command starts the database and the app, applies migrations and
the seed, and plays a round:

```bash
docker compose up -d --build --wait && docker compose exec app npm run -s simulate
```

```
Round rnd_65bc743c-… · CLOSED · request id sim-0e46cf20-…

  step           transaction                       amount     balance
  balance                                                    1,000.00
  bet            bet_5d32ced8                       10.00      990.00
  bet            bet_23ca30ba                        5.00      985.00
  duplicate_bet  bet_5d32ced8                       10.00      990.00  replayed, not charged
  rollback       rb_2d32ed53 → bet_23ca30ba          5.00      990.00
  win            win_12ed4982 → bet_5d32ced8        25.00    1,015.00
  balance                                                    1,015.00

Balance 1,000.00 → 1,015.00 USD
```

Run it again to play another round (`1,015.00 → 1,030.00`). `npm run -s simulate -- --user 2`
plays as bob. The app listens on `localhost:3000`; set `APP_PORT` or `DB_PORT` if 3000 or
5432 are taken. `docker compose logs app` shows one log line per request, with the request id.

## Running a round

`POST /casino/simulateRound` (unsigned test driver) launches a session and asks the
provider to play a scripted round on it: balance check, two bets, the first bet resent
with the same id, a rollback, a payout and a final balance check. `npm run simulate`
calls it and prints the steps; with `curl`:

```bash
curl -s -X POST localhost:3000/casino/simulateRound \
  -H 'content-type: application/json' \
  -d '{"userId": 1, "gameId": 1, "currency": "USD"}'
```

```json
{
  "sessionToken": "…", "providerSessionId": "psess_…", "gameUrl": "…", "balance": "100000", "currency": "USD",
  "round": {
    "roundId": "rnd_…", "status": "CLOSED",
    "startingBalance": "100000", "finalBalance": "101500", "totalBet": "1000", "totalPayout": "2500",
    "steps": [
      { "step": "balance", "balance": "100000" },
      { "step": "bet", "transactionId": "bet_…", "amount": 1000, "balance": "99000" },
      { "step": "bet", "transactionId": "bet_…", "amount": 500, "balance": "98500" },
      { "step": "duplicate_bet", "transactionId": "bet_…", "amount": 1000, "balance": "99000", "replayed": true },
      { "step": "rollback", "transactionId": "rb_…", "relatedTransactionId": "bet_…", "amount": 500, "balance": "99000" },
      { "step": "win", "transactionId": "win_…", "relatedTransactionId": "bet_…", "amount": 2500, "balance": "101500" },
      { "step": "balance", "balance": "101500" }
    ]
  }
}
```

The resent bet gets the casino's first answer back (`99000`, its balance at the time)
and is not charged again. Every run uses new round and transaction ids, so re-running
plays a new round. The script and its rules are in [D18](docs/decisions.md#d18--scripted-round).

If the casino rejects a call mid-round (for example `INSUFFICIENT_FUNDS`), the provider
rolls back the bets it already placed and the call returns `502 PROVIDER_ERROR` with
`details: { "status": 422, "error": "ROUND_FAILED" }`.

## Sending requests by hand

`npm run call` signs a request with the right header and secret for the receiving system
(taken from the path) and prints the answer; `--curl` prints the curl command instead.
Launch a game to get a session, then call the casino as the provider would:

```bash
curl -s -X POST localhost:3000/casino/launchGame -H 'content-type: application/json' \
  -d '{"userId": 1, "gameId": 1, "currency": "USD"}'

npm run -s call -- /casino/debit \
  '{"sessionToken":"<token>","userId":1,"currency":"USD","transactionId":"bet_1","roundId":"r1","amount":500}'
```

Send the same debit twice to see the replay, or change the amount to get
`409 IDEMPOTENCY_CONFLICT`. It needs Node and the secrets in `.env` (`cp .env.example .env && npm install`).

## Development

Requirements: Node.js 18+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up      # set DB_PORT if 5432 is busy
npm run db:deploy
npm run db:seed
npm run dev        # http://localhost:3000/health
npm test           # resets casino and provider tables to the seed state
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the server and reload on change |
| `npm test` | Run the test suite (needs the database up, migrated and seeded) |
| `npm run simulate` | Play a round against a running server (`--user`, `--url`, `--json`) |
| `npm run call` | Send a signed request by hand (`--url`, `--curl`) |
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:deploy` | Apply the committed migrations |
| `npm run db:seed` | Create players alice (1,000.00 USD) and bob (500.00 USD) and game `slots-777` |
| `npm run db:migrate` | Create and apply a migration after editing `schema.prisma` |
| `npm run db:reset` | Drop, re-apply migrations and seed |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | TypeScript without emitting |
| `npm run build` / `npm start` | Compile to `dist/` and run it |

CI runs lint, format, typecheck, build, a schema/migration drift check and the tests
against PostgreSQL, then builds the Docker image and plays two rounds in it.

## Architecture

- [docs/architecture.md](docs/architecture.md) — components, the round sequence, trust rules
- [docs/database.md](docs/database.md) — tables, relations and database constraints
- [docs/decisions.md](docs/decisions.md) — technical decisions and why

```
src/
  casino/     routes, services, repositories; wallet, ledger, idempotency, rollback rules
  provider/   launch, rounds and bets, the casino client, the scripted round
  shared/     config, logger, HMAC signing, errors, request context
prisma/       schema, migration, seed
scripts/      npm run simulate, npm run call
tests/        one file per endpoint or rule, plus end-to-end rounds
```

## Launching a game

`POST /casino/launchGame` is called by the frontend (unsigned):

```json
// request
{ "userId": 1, "gameId": 1, "currency": "USD" }
// 201
{ "sessionToken": "…", "providerSessionId": "psess_…", "gameUrl": "https://games.jaqpot.example/play/slots-777?session=psess_…", "balance": "100000", "currency": "USD" }
```

The casino creates its session, then calls `POST /provider/launch` (signed with
`x-provider-signature`), and links both. If the provider refuses or does not answer,
the casino session is deactivated and the response is `502 PROVIDER_ERROR`.

## Provider API — called by the casino

Signed with `x-provider-signature` (`PROVIDER_SECRET`).

| Endpoint | Body | Notes |
|---|---|---|
| `/provider/launch` | `sessionToken`, `userId`, `gameId`, `currency`, `casinoCode` | Idempotent per casino session token |
| `/provider/simulate` | `providerSessionId`, `sessionToken`, `userId`, `currency`, `casinoCode` | All must match the launched session |

| Status | `error` | When |
|---|---|---|
| 403 | `SESSION_MISMATCH` | Casino, token, player or currency differ from the session |
| 404 | `CASINO_NOT_FOUND`, `GAME_NOT_FOUND`, `SESSION_NOT_FOUND` | Unknown or inactive |
| 409 | `SESSION_CONFLICT` | Casino session already launched for another player or game |
| 422 | `ROUND_FAILED` | The casino rejected a call; accepted bets were rolled back |
| 502 | `CASINO_UNAVAILABLE` | No answer from the casino after retries |

## Casino API — provider callbacks

All callbacks are `POST`, signed with `x-casino-signature` (`CASINO_SECRET`), and take
`sessionToken`, `userId` and `currency`. Amounts are integer cents; balances come back as strings.

| Endpoint | Extra fields | Notes |
|---|---|---|
| `/casino/getBalance` | – | Read-only |
| `/casino/debit` | `transactionId`, `roundId`, `amount` | Atomic; checks funds and the game's bet limits |
| `/casino/credit` | `transactionId`, `roundId`, `amount`, `relatedTransactionId` | Must reference an accepted, not rolled back bet in the same round; `amount` may be 0 |
| `/casino/rollback` | `transactionId`, `roundId`, `relatedTransactionId` | Refunds a bet; see rollback rules |

```json
// POST /casino/debit
{ "sessionToken": "…", "userId": 1, "currency": "USD", "transactionId": "bet_1", "roundId": "r1", "amount": 500 }
// 200
{ "balance": "99500", "transactionId": "bet_1" }
```

**Idempotency.** Sending the same `transactionId` again returns the first response and moves
no money. Reusing it with a different amount, type, round or bet returns `409 IDEMPOTENCY_CONFLICT`.

**Rollback rules.** Only bets, at most once, never after the round has a payout. A rollback
for an unknown bet records a **tombstone** (`"tombstone": true`, balance unchanged), and that
bet is rejected if it arrives later. Details in [D13](docs/decisions.md#d13--rollback-rules).

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `INVALID_SIGNATURE` | Missing or wrong signature |
| 403 | `SESSION_USER_MISMATCH` | `userId` does not own the session |
| 404 | `SESSION_NOT_FOUND`, `GAME_NOT_FOUND`, `WALLET_NOT_FOUND` | Unknown or inactive session, game or wallet |
| 409 | `IDEMPOTENCY_CONFLICT`, `CREDIT_NOT_ALLOWED` | Reused id, or payout without a valid bet |
| 409 | `ROLLBACK_NOT_ALLOWED`, `BET_ALREADY_ROLLED_BACK` | Rollback rule broken, or bet arriving after its tombstone |
| 422 | `INSUFFICIENT_FUNDS`, `BET_LIMIT_EXCEEDED`, `CURRENCY_MISMATCH` | Bet cannot be accepted |

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | – | PostgreSQL connection string |
| `CASINO_SECRET` | yes | – | HMAC key for provider → casino calls (`x-casino-signature`), min 16 chars |
| `PROVIDER_SECRET` | yes | – | HMAC key for casino → provider calls (`x-provider-signature`), min 16 chars |
| `PORT` | no | `3000` | HTTP port |
| `CASINO_CODE` | no | `HOUSE` | How the casino identifies itself to providers |
| `LOG_LEVEL` | no | `info` | pino level (`silent` in tests) |
| `BASE_URL` | no | `http://localhost:$PORT` | Where the seed points both registries (casino → provider, provider → casino) |

The server refuses to start if a secret is missing or too short. With Docker, `APP_PORT`
and `DB_PORT` change the published ports.

## Errors

Every error response has the same shape:

```json
{ "error": "INVALID_SIGNATURE", "message": "Missing or invalid HMAC signature" }
```

Each response carries an `x-request-id` header; send your own to trace a call across both systems.

## Next steps

Out of scope for the test, in the order I would take them:

- A reconciliation job for calls still `PENDING` because the casino was down even for the
  failed round's rollbacks (same id, so resending is safe).
- A timestamp and nonce in the signed payload to refuse replays outright; today a replay is
  harmless because every money call is idempotent ([D7](docs/decisions.md#d7--signatures-cover-the-raw-request-bytes)).
- Player authentication on `launchGame` and `simulateRound`.
- Secrets from a secret manager instead of env variables and registry columns.
- Casino and provider as separate deployments with their own databases; they already share
  nothing but HTTP.
- A slimmer production image (multi-stage, no dev dependencies).

## Stack

Node.js 20 · TypeScript · Express · PostgreSQL 16 · Prisma · Vitest · Docker

## Repository conventions

- Work is split into milestones; each one is an issue and a pull request.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
