# Architecture

Two systems with a trust boundary between them. For this test they share one
codebase and one PostgreSQL database, but stay logically separated:
separate route namespaces, separate table prefixes, and no direct writes into
the other side's tables. They only talk over signed HTTP.

## Components

```mermaid
flowchart LR
    Client["Frontend / test client"]

    subgraph Casino["Casino platform"]
        CR["/casino/* routes"]
        Wallet["Wallet: balances, ledger, idempotency"]
    end

    subgraph Provider["Game provider (Jaqpot)"]
        PR["/provider/* routes"]
        Rounds["Game rounds and bets"]
    end

    subgraph DB["PostgreSQL"]
        CT[("CASINO_* tables")]
        PT[("PROVIDER_* tables")]
    end

    Client -->|"launchGame, simulateRound"| CR
    CR -->|"launch, simulate<br/>x-provider-signature"| PR
    PR -->|"getBalance, debit, credit, rollback<br/>x-casino-signature"| CR
    Wallet --- CT
    Rounds --- PT
```

## A game round

```mermaid
sequenceDiagram
    participant C as Client
    participant CA as Casino
    participant PR as Provider

    C->>CA: POST /casino/launchGame
    CA->>PR: POST /provider/launch (x-provider-signature)
    PR-->>CA: providerSessionId, gameUrl
    CA-->>C: sessionToken, gameUrl, balance

    Note over PR: player bets and wins
    PR->>CA: POST /casino/getBalance (x-casino-signature)
    PR->>CA: POST /casino/debit — bet
    PR->>CA: POST /casino/rollback — cancel a bet
    PR->>CA: POST /casino/credit — payout
    CA-->>PR: authoritative balance after each call
```

## Trust rules

- The casino is the source of truth for balances. The provider never computes a
  balance; it only shows what the casino returns.
- The provider changes balances only by calling casino endpoints.
- The casino assumes provider requests can be duplicated, retried or reordered:
  every money call carries a provider-generated `transactionId` and is idempotent.
- Each direction has its own secret. The signature header names the receiver:
  `x-casino-signature` (`CASINO_SECRET`) when calling the casino,
  `x-provider-signature` (`PROVIDER_SECRET`) when calling the provider.
