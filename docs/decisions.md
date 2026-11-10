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
