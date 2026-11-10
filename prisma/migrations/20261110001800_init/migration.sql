-- CreateTable
CREATE TABLE "casino_users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_wallets" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "playable_balance" BIGINT NOT NULL DEFAULT 0,
    "redeemable_balance" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "casino_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_game_providers" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "api_endpoint" VARCHAR(255) NOT NULL,
    "secret_key" VARCHAR(255) NOT NULL,
    "is_disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_game_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_games" (
    "id" SERIAL NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "provider_game_id" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_bet" BIGINT NOT NULL,
    "max_bet" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_game_sessions" (
    "id" SERIAL NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "provider_session_id" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "casino_transactions" (
    "id" SERIAL NOT NULL,
    "wallet_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "round_id" VARCHAR(100) NOT NULL,
    "transaction_type" VARCHAR(10) NOT NULL,
    "amount" BIGINT NOT NULL,
    "external_transaction_id" VARCHAR(100) NOT NULL,
    "related_external_transaction_id" VARCHAR(100),
    "balance_after" BIGINT NOT NULL,
    "response_cache" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "casino_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_games" (
    "id" SERIAL NOT NULL,
    "game_id" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "min_bet" BIGINT NOT NULL,
    "max_bet" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_casinos" (
    "id" SERIAL NOT NULL,
    "casino_code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "casino_api_endpoint" VARCHAR(255) NOT NULL,
    "casino_secret" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_casinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_customers" (
    "id" SERIAL NOT NULL,
    "player_id" VARCHAR(100) NOT NULL,
    "casino_id" INTEGER NOT NULL,
    "external_user_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_game_sessions" (
    "id" SERIAL NOT NULL,
    "provider_session_id" VARCHAR(100) NOT NULL,
    "casino_session_token" VARCHAR(64) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_game_rounds" (
    "id" SERIAL NOT NULL,
    "round_id" VARCHAR(100) NOT NULL,
    "session_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "total_bet_amount" BIGINT NOT NULL DEFAULT 0,
    "total_payout_amount" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_game_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_bets" (
    "id" SERIAL NOT NULL,
    "transaction_id" VARCHAR(100) NOT NULL,
    "round_id" INTEGER NOT NULL,
    "bet_type" VARCHAR(10) NOT NULL,
    "amount" BIGINT NOT NULL,
    "related_transaction_id" VARCHAR(100),
    "casino_balance_after" BIGINT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "response_cache" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_bets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "casino_users_username_key" ON "casino_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "casino_users_email_key" ON "casino_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "casino_wallets_user_id_currency_code_key" ON "casino_wallets"("user_id", "currency_code");

-- CreateIndex
CREATE UNIQUE INDEX "casino_game_providers_code_key" ON "casino_game_providers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "casino_games_provider_id_provider_game_id_key" ON "casino_games"("provider_id", "provider_game_id");

-- CreateIndex
CREATE UNIQUE INDEX "casino_game_sessions_token_key" ON "casino_game_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "casino_game_sessions_provider_session_id_key" ON "casino_game_sessions"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "casino_transactions_external_transaction_id_key" ON "casino_transactions"("external_transaction_id");

-- CreateIndex
CREATE INDEX "casino_transactions_wallet_id_round_id_idx" ON "casino_transactions"("wallet_id", "round_id");

-- CreateIndex
CREATE INDEX "casino_transactions_related_external_transaction_id_idx" ON "casino_transactions"("related_external_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_games_game_id_key" ON "provider_games"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_casinos_casino_code_key" ON "provider_casinos"("casino_code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_customers_player_id_key" ON "provider_customers"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_customers_casino_id_external_user_id_key" ON "provider_customers"("casino_id", "external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_game_sessions_provider_session_id_key" ON "provider_game_sessions"("provider_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_game_sessions_casino_session_token_key" ON "provider_game_sessions"("casino_session_token");

-- CreateIndex
CREATE UNIQUE INDEX "provider_game_rounds_round_id_key" ON "provider_game_rounds"("round_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_bets_transaction_id_key" ON "provider_bets"("transaction_id");

-- AddForeignKey
ALTER TABLE "casino_wallets" ADD CONSTRAINT "casino_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "casino_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_games" ADD CONSTRAINT "casino_games_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "casino_game_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_game_sessions" ADD CONSTRAINT "casino_game_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "casino_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_game_sessions" ADD CONSTRAINT "casino_game_sessions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "casino_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_game_sessions" ADD CONSTRAINT "casino_game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "casino_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_transactions" ADD CONSTRAINT "casino_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "casino_wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "casino_transactions" ADD CONSTRAINT "casino_transactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "casino_game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_customers" ADD CONSTRAINT "provider_customers_casino_id_fkey" FOREIGN KEY ("casino_id") REFERENCES "provider_casinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_game_sessions" ADD CONSTRAINT "provider_game_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "provider_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_game_sessions" ADD CONSTRAINT "provider_game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "provider_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_game_rounds" ADD CONSTRAINT "provider_game_rounds_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "provider_game_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_game_rounds" ADD CONSTRAINT "provider_game_rounds_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "provider_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_game_rounds" ADD CONSTRAINT "provider_game_rounds_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "provider_games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_bets" ADD CONSTRAINT "provider_bets_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "provider_game_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────
-- Hand-written CHECK constraints (Prisma's schema language has no CHECK).
-- Defense in depth: the application enforces these rules too, but the
-- database refuses a negative balance or an unknown transaction type
-- even if a bug slips through.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "casino_wallets"
  ADD CONSTRAINT "casino_wallets_playable_balance_non_negative" CHECK ("playable_balance" >= 0),
  ADD CONSTRAINT "casino_wallets_redeemable_balance_non_negative" CHECK ("redeemable_balance" >= 0),
  ADD CONSTRAINT "casino_wallets_currency_code_upper" CHECK ("currency_code" ~ '^[A-Z]{3}$');

ALTER TABLE "casino_games"
  ADD CONSTRAINT "casino_games_bet_limits_valid" CHECK ("min_bet" > 0 AND "max_bet" >= "min_bet");

ALTER TABLE "casino_transactions"
  ADD CONSTRAINT "casino_transactions_type_valid" CHECK ("transaction_type" IN ('DEBIT', 'CREDIT', 'ROLLBACK')),
  ADD CONSTRAINT "casino_transactions_amount_non_negative" CHECK ("amount" >= 0),
  ADD CONSTRAINT "casino_transactions_balance_after_non_negative" CHECK ("balance_after" >= 0);

ALTER TABLE "provider_games"
  ADD CONSTRAINT "provider_games_bet_limits_valid" CHECK ("min_bet" > 0 AND "max_bet" >= "min_bet");

ALTER TABLE "provider_bets"
  ADD CONSTRAINT "provider_bets_type_valid" CHECK ("bet_type" IN ('BET', 'WIN', 'ROLLBACK')),
  ADD CONSTRAINT "provider_bets_status_valid" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'FAILED', 'ROLLED_BACK')),
  ADD CONSTRAINT "provider_bets_amount_non_negative" CHECK ("amount" >= 0);

ALTER TABLE "provider_game_rounds"
  ADD CONSTRAINT "provider_game_rounds_status_valid" CHECK ("status" IN ('OPEN', 'CLOSED', 'FAILED'));
