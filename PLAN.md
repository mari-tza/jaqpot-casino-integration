# Implementation plan

Casino platform and game provider (Jaqpot) integration, built from the
[technical test](#requirements-traceability) requirements.

## Approach

Build the system in small, reviewable milestones. Money correctness first
(wallet, idempotency, rollback rules), then the flows that use it
(launch, simulation), then the run-and-review experience.

## Workflow

- One milestone → one GitHub issue → one branch → one pull request.
- Branch names: `feat/…`, `fix/…`, `test/…`, `docs/…`, `chore/…`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- Every PR must pass CI (lint, typecheck, tests) before merge.
- PRs are merged with a merge commit; the branch is deleted after merge.
- Technical decisions are recorded in `docs/decisions.md` as they are made.
- This file is updated in each PR: checkboxes reflect what is merged.

## Milestones

### M0 — Project setup
- [x] TypeScript + Express skeleton with `GET /health`
- [x] PostgreSQL via `docker compose`
- [x] Prisma configured (datasource only; models and client come with M1)
- [x] Vitest with a first test
- [x] ESLint + Prettier
- [x] CI: lint, typecheck, tests
- [x] Pull request template

### M1 — Database schema
- [x] Casino tables: users, wallets, game providers, games, game sessions, transactions
- [x] Provider tables: games, customers, game sessions, game rounds, bets
- [x] Unique external transaction ids per system; round id on casino transactions
- [x] Prisma client wired; `/health` checks the database
- [x] Initial migration and seed (two players, one game, provider and casino registry)
- [x] Naming decision for `CASINO_*` / `PROVIDER_*` prefixes recorded

### M2 — Shared infrastructure
- [x] HMAC-SHA256 sign/verify over the raw request body, constant-time compare
- [x] One middleware per direction (`x-casino-signature`, `x-provider-signature`)
- [x] Error model with stable error codes and a single error handler
- [x] Request id propagation and structured logging

### M3 — Casino wallet callbacks
- [x] `POST /casino/getBalance` (read-only)
- [x] `POST /casino/debit`: funds check, bet limits, atomic update under a row lock
- [x] `POST /casino/credit`: linked to an accepted bet in the same round
- [x] Idempotency: replay the stored response, reject a reused id with a different payload, safe under concurrency
- [x] Session checks: user owns the session, currency matches the wallet

### M4 — Rollback rules (optional in the spec)
- [x] Only bets can be rolled back, never payouts
- [x] No rollback once the round has a payout
- [x] A bet is refunded at most once
- [x] Tombstone when the bet is unknown; a bet arriving after its tombstone is rejected

### M5 — Launch flow
- [x] `POST /casino/launchGame` validates player, wallet and game, creates the casino session
- [x] `POST /provider/launch` creates and stores the provider session
- [x] Casino and provider sessions linked; casino session deactivated if the provider refuses

### M6 — Simulation
- [ ] Provider → casino client: signed calls, retries with the same transaction id
- [ ] Provider bets recorded before calling the casino, then updated with the result
- [ ] `POST /provider/simulate`: validates session and player, runs the scripted round
      (balance check, bets, a duplicate bet, a rollback, a payout)
- [ ] `POST /casino/simulateRound`: launch + simulate, end-to-end
- [ ] End-to-end tests, including re-running the simulation

### M7 — Run and review experience
- [ ] Dockerfile; `docker compose up` runs app and database
- [ ] Helper to send signed requests by hand
- [ ] README: setup, single command to run a round, API reference, error codes

## Requirements traceability

| Requirement (technical test) | Milestone |
|---|---|
| `/casino/*` and `/provider/*` namespaces, logically separated systems | M0, M5 |
| `CASINO_*` / `PROVIDER_*` tables, no cross-domain writes | M1 |
| Wallet balances with transactional integrity and locking | M3 |
| Idempotent debit / credit / rollback by `transactionId` | M3, M4 |
| Rollback rules and tombstones | M4 |
| HMAC-SHA256, one secret and header per direction | M2 |
| `launchGame` → `provider/launch` | M5 |
| `simulateRound` → `provider/simulate` with balance, bets, wins, rollback | M6 |
| Schema and migrations | M1 |
| README with setup and a single command for `simulateRound` | M7 |

## Out of scope

- Real game math or RNG: the round is scripted.
- Frontend authentication for `launchGame`: the client is trusted in this test.
- Currency conversion: one wallet per currency.
