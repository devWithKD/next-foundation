export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  /** Safe to show a user? Internal messages must never leak. */
  readonly expose: boolean = true;
  constructor(
    message: string,
    readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  code = "not_found";
  httpStatus = 404;
}
export class ForbiddenError extends AppError {
  code = "forbidden";
  httpStatus = 403;
}
export class ConflictError extends AppError {
  code = "conflict";
  httpStatus = 409;
}
export class RateLimitError extends AppError {
  code = "rate_limit";
  httpStatus = 429;
}

export class UnauthorizedError extends AppError {
  code = "unauthorized";
  httpStatus = 401;
  constructor(message = "You need to sign in") {
    super(message);
  }
}

export class ValidationError extends AppError {
  code = "validation";
  httpStatus = 422;
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super("Validation failed");
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
