# Jaqpot Casino Integration

Backend technical test: an online casino platform and an external game provider
(Jaqpot) integrated through signed HTTP callbacks.

- **Casino platform** — owns player wallets, validates bets and is the source of truth for balances.
- **Game provider** — runs game rounds and moves money only by calling the casino.

> **Status:** in progress. See [PLAN.md](PLAN.md) for milestones and progress.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the component diagram, the
round sequence and the trust rules between both systems.

## Planned stack

Node.js 20 · TypeScript · Express · PostgreSQL 16 · Prisma · Vitest · Docker

## Repository conventions

- Work is split into milestones; each one is an issue and a pull request.
- Commits follow Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Technical decisions are recorded in `docs/decisions.md`.

Setup and run instructions will be added as the project is built.
