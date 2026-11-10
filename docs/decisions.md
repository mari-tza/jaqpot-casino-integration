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
