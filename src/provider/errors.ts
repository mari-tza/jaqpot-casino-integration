import { AppError } from "../shared/errors/AppError";

export class CasinoNotRegisteredError extends AppError {
  constructor() {
    super(404, "CASINO_NOT_FOUND", "Casino is not registered with this provider");
  }
}

export class ProviderGameNotFoundError extends AppError {
  constructor() {
    super(404, "GAME_NOT_FOUND", "Game not found or inactive");
  }
}

export class SessionConflictError extends AppError {
  constructor() {
    super(409, "SESSION_CONFLICT", "This casino session was already launched for another player or game");
  }
}

export class CasinoUnavailableError extends AppError {
  constructor(path: string, attempts: number, reason: string) {
    super(502, "CASINO_UNAVAILABLE", `Casino ${path} ${reason} after ${attempts} attempts`, { path, attempts });
  }
}

export class ProviderSessionNotFoundError extends AppError {
  constructor() {
    super(404, "SESSION_NOT_FOUND", "Provider session not found or inactive");
  }
}

export class SessionMismatchError extends AppError {
  constructor() {
    super(403, "SESSION_MISMATCH", "Session does not match this casino, player, token or currency");
  }
}

/** A casino rejection stopped the round; accepted bets were refunded. */
export class RoundFailedError extends AppError {
  constructor(details: { roundId: string; step: string; casinoStatus: number; casinoError?: string }) {
    super(422, "ROUND_FAILED", `Round failed at ${details.step}`, details);
  }
}
