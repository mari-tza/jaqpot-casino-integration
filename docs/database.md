# Database

One PostgreSQL database, two domains. Casino tables are prefixed `casino_`,
provider tables `provider_`. Neither side reads or writes the other's tables;
the only link between them is the casino session token and transaction ids,
exchanged over HTTP.

Amounts are integer minor units (cents) in `BIGINT`. Migrations live in
`prisma/migrations` (`npm run db:deploy` applies them).

## Casino domain

```mermaid
erDiagram
    casino_users ||--o{ casino_wallets : owns
    casino_users ||--o{ casino_game_sessions : plays
    casino_wallets ||--o{ casino_game_sessions : funds
    casino_wallets ||--o{ casino_transactions : "ledger of"
    casino_game_providers ||--o{ casino_games : offers
    casino_games ||--o{ casino_game_sessions : "played in"
    casino_game_sessions ||--o{ casino_transactions : "made in"

    casino_users {
        int id PK
        varchar username UK
        varchar email UK
    }
    casino_wallets {
        int id PK
        int user_id FK
        char currency_code "UK with user_id"
        bigint playable_balance "CHECK >= 0"
        bigint redeemable_balance "CHECK >= 0"
    }
    casino_game_providers {
        int id PK
        varchar code UK
        varchar api_endpoint
        varchar secret_key
        bool is_disabled
    }
    casino_games {
        int id PK
        int provider_id FK
        varchar provider_game_id "UK with provider_id"
        bigint min_bet
        bigint max_bet
    }
    casino_game_sessions {
        int id PK
        varchar token UK
        int user_id FK
        int wallet_id FK
        int game_id FK
        varchar provider_session_id UK
        bool is_active
    }
    casino_transactions {
        int id PK
        int wallet_id FK
        int session_id FK
        varchar round_id
        varchar transaction_type "DEBIT | CREDIT | ROLLBACK"
        bigint amount "CHECK >= 0"
        varchar external_transaction_id UK
        varchar related_external_transaction_id
        bigint balance_after
        json response_cache
    }
```

`casino_transactions` is the ledger and the idempotency store at the same time:
the provider's transaction id is `UNIQUE`, and `response_cache` keeps the first
successful answer so a retry gets exactly the same response.

## Provider domain

```mermaid
erDiagram
    provider_casinos ||--o{ provider_customers : "has players"
    provider_customers ||--o{ provider_game_sessions : opens
    provider_games ||--o{ provider_game_sessions : "played in"
    provider_game_sessions ||--o{ provider_game_rounds : contains
    provider_customers ||--o{ provider_game_rounds : plays
    provider_games ||--o{ provider_game_rounds : "round of"
    provider_game_rounds ||--o{ provider_bets : groups

    provider_casinos {
        int id PK
        varchar casino_code UK
        varchar casino_api_endpoint
        varchar casino_secret
    }
    provider_customers {
        int id PK
        varchar player_id UK
        int casino_id FK
        varchar external_user_id "UK with casino_id"
    }
    provider_games {
        int id PK
        varchar game_id UK
        bigint min_bet
        bigint max_bet
    }
    provider_game_sessions {
        int id PK
        varchar provider_session_id UK
        varchar casino_session_token UK
        int customer_id FK
        int game_id FK
        char currency
    }
    provider_game_rounds {
        int id PK
        varchar round_id UK
        int session_id FK
        varchar status "OPEN | CLOSED | FAILED"
        bigint total_bet_amount
        bigint total_payout_amount
    }
    provider_bets {
        int id PK
        varchar transaction_id UK
        int round_id FK
        varchar bet_type "BET | WIN | ROLLBACK"
        bigint amount
        varchar related_transaction_id
        bigint casino_balance_after
        varchar status "PENDING | ACCEPTED | FAILED | ROLLED_BACK"
        json response_cache
    }
```

`casino_balance_after` is a copy of what the casino answered, for audit. The
provider never derives a balance from its own rows.

## Constraints enforced by the database

| Table | Rule |
|---|---|
| `casino_wallets` | balances `>= 0`; one wallet per user and currency; currency is 3 upper-case letters |
| `casino_transactions` | `external_transaction_id` unique; type in `DEBIT, CREDIT, ROLLBACK`; amount and balance after `>= 0` |
| `casino_games`, `provider_games` | `min_bet > 0` and `max_bet >= min_bet` |
| `provider_bets` | `transaction_id` unique; known type and status; amount `>= 0` |
| `provider_game_rounds` | known status |

CHECK constraints are hand-written in the initial migration because Prisma's
schema language cannot express them. CI runs `prisma migrate diff` to make sure
the schema and the migrations never drift apart.
