/** What a failure looks like on the wire, for server actions and route handlers alike. */
export type ErrorPayload = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  /** Short log/Sentry reference, set only for unexpected (non-AppError) failures. */
  ref?: string;
};

/** Server action result. Actions return errors as data; they never throw. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | ({ ok: false } & ErrorPayload);

/** Route handler envelopes. */
export type ApiSuccess<T> = { data: T };
export type ApiFailure = { error: ErrorPayload };
