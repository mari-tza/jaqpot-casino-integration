import { AppError } from "../shared/errors/AppError";

export class SessionNotFoundError extends AppError {
  constructor() {
    super(404, "SESSION_NOT_FOUND", "Game session not found or inactive");
  }
}

export class SessionUserMismatchError extends AppError {
  constructor() {
    super(403, "SESSION_USER_MISMATCH", "Session does not belong to this user");
  }
}

export class CurrencyMismatchError extends AppError {
  constructor() {
    super(422, "CURRENCY_MISMATCH", "Currency does not match the wallet");
  }
}

export class WalletNotFoundError extends AppError {
  constructor() {
    super(404, "WALLET_NOT_FOUND", "Wallet not found");
  }
}

export class InsufficientFundsError extends AppError {
  constructor() {
    super(422, "INSUFFICIENT_FUNDS", "Insufficient funds");
  }
}

export class BetLimitError extends AppError {
  constructor(min: bigint, max: bigint) {
    super(422, "BET_LIMIT_EXCEEDED", `Bet must be between ${min} and ${max}`);
  }
}

/** Same transactionId, different request. */
export class IdempotencyConflictError extends AppError {
  constructor() {
    super(409, "IDEMPOTENCY_CONFLICT", "transactionId was already used for a different request");
  }
}
