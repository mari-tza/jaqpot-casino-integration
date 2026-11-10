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
