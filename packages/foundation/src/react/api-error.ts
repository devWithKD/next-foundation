import type { ErrorPayload } from "../result";

/**
 * What every failed request or action looks like on the client.
 * `status` is the HTTP status, `0` for a network failure, and `null` for a
 * server action (which has no HTTP status of its own).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly payload: ErrorPayload,
    options?: { cause?: unknown },
  ) {
    super(payload.message, options);
    this.name = "ApiError";
  }

  get code(): string {
    return this.payload.code;
  }

  get fieldErrors(): Record<string, string[]> | undefined {
    return this.payload.fieldErrors;
  }

  /** Short log reference for unexpected server errors; show it so users can quote it. */
  get ref(): string | undefined {
    return this.payload.ref;
  }
}
