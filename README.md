# Jaqpot Casino Integration

Backend technical test: an online casino platform and an external game provider
(Jaqpot) integrated through signed HTTP callbacks.

- **Casino platform** — owns player wallets, validates bets and is the source of truth for balances.
- **Game provider** — runs game rounds and moves money only by calling the casino.

> **Status:** in progress. See [PLAN.md](PLAN.md) for milestones and progress.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the component diagram, the
round sequence and the trust rules between both systems,
[docs/database.md](docs/database.md) for tables and constraints. Technical decisions are
in [docs/decisions.md](docs/decisions.md).

## Development

Requirements: Node.js 18+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up      # set DB_PORT if 5432 is busy
npm run db:deploy
npm run db:seed
npm run dev        # http://localhost:3000/health
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the server and reload on change |
| `npm test` | Run the test suite (needs the database up, migrated and seeded) |
| `npm run db:up` | Start PostgreSQL in Docker |
| `npm run db:deploy` | Apply the committed migrations |
| `npm run db:seed` | Create players alice (1,000.00 USD) and bob (500.00 USD) and game `slots-777` |
| `npm run db:migrate` | Create and apply a migration after editing `schema.prisma` |
| `npm run db:reset` | Drop, re-apply migrations and seed |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | TypeScript without emitting |
| `npm run build` / `npm start` | Compile to `dist/` and run it |

## Casino API — provider callbacks

All callbacks are `POST`, signed with `x-casino-signature` (`CASINO_SECRET`), and take
`sessionToken`, `userId` and `currency`. Amounts are integer cents; balances come back as strings.

| Endpoint | Extra fields | Notes |
|---|---|---|
| `/casino/getBalance` | – | Read-only |
| `/casino/debit` | `transactionId`, `roundId`, `amount` | Atomic; checks funds and the game's bet limits |
| `/casino/credit` | `transactionId`, `roundId`, `amount`, `relatedTransactionId` | Must reference an accepted bet in the same round; `amount` may be 0 |

```json
// POST /casino/debit
{ "sessionToken": "…", "userId": 1, "currency": "USD", "transactionId": "bet_1", "roundId": "r1", "amount": 500 }
// 200
{ "balance": "99500", "transactionId": "bet_1" }
```

**Idempotency.** Sending the same `transactionId` again returns the first response and moves
no money. Reusing it with a different amount, type or bet returns `409 IDEMPOTENCY_CONFLICT`.

| Status | `error` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body fails validation |
| 401 | `INVALID_SIGNATURE` | Missing or wrong signature |
| 403 | `SESSION_USER_MISMATCH` | `userId` does not own the session |
| 404 | `SESSION_NOT_FOUND` | Unknown or inactive session |
| 409 | `IDEMPOTENCY_CONFLICT`, `CREDIT_NOT_ALLOWED` | Reused id, or payout without a valid bet |
| 422 | `INSUFFICIENT_FUNDS`, `BET_LIMIT_EXCEEDED`, `CURRENCY_MISMATCH` | Bet cannot be accepted |

## Configuration

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | – | PostgreSQL connection string |
| `CASINO_SECRET` | yes | – | HMAC key for provider → casino calls (`x-casino-signature`), min 16 chars |
| `PROVIDER_SECRET` | yes | – | HMAC key for casino → provider calls (`x-provider-signature`), min 16 chars |
| `PORT` | no | `3000` | HTTP port |
| `LOG_LEVEL` | no | `info` | pino level (`silent` in tests) |

The server refuses to start if a secret is missing or too short.

## Errors

Every error response has the same shape:

```json
{ "error": "INVALID_SIGNATURE", "message": "Missing or invalid HMAC signature" }
```

Each response carries an `x-request-id` header; send your own to trace a call across both systems.

## Stack

Node.js 20 · TypeScript · Express · PostgreSQL 16 · Prisma · Vitest · Docker

## Repository conventions

- Work is split into milestones; each one is an issue and a pull request.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
