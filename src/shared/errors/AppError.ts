/** Expected error with a stable code. Anything else becomes a 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Route not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class InvalidSignatureError extends AppError {
  constructor() {
    super(401, "INVALID_SIGNATURE", "Missing or invalid HMAC signature");
  }
}
