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
