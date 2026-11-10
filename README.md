# Jaqpot Casino Integration

Backend technical test: an online casino platform and an external game provider
(Jaqpot) integrated through signed HTTP callbacks.

- **Casino platform** — owns player wallets, validates bets and is the source of truth for balances.
- **Game provider** — runs game rounds and moves money only by calling the casino.

> **Status:** in progress. See [PLAN.md](PLAN.md) for milestones and progress.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the component diagram, the
round sequence and the trust rules between both systems. Technical decisions are
in [docs/decisions.md](docs/decisions.md).

## Development

Requirements: Node.js 18+ and Docker.

```bash
cp .env.example .env
npm install
npm run db:up      # PostgreSQL in Docker (set DB_PORT if 5432 is busy)
npm run dev        # http://localhost:3000/health
```

| Script | What it does |
|---|---|
| `npm run dev` | Start the server and reload on change |
| `npm test` | Run the test suite |
| `npm run lint` / `npm run format` | ESLint / Prettier |
| `npm run typecheck` | TypeScript without emitting |
| `npm run build` / `npm start` | Compile to `dist/` and run it |

## Stack

Node.js 20 · TypeScript · Express · PostgreSQL 16 · Prisma · Vitest · Docker

## Repository conventions

- Work is split into milestones; each one is an issue and a pull request.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
