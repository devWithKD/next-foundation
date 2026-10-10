export type LogFields = Record<string, unknown>;

/** Business events. Low volume, expected, notification-worthy. */
export type BusinessEvent = {
  event: string; // "sales_order.dispatched"
  actorLabel?: string;
  fields?: LogFields;
};

export interface Logger {
  debug(fields: LogFields, msg: string): void;
  info(fields: LogFields, msg: string): void;

  /** Something wrong but handled. → stdout + Sentry (level: warning). No Discord. */
  warn(fields: LogFields & { err?: unknown }, msg: string): void;

  /** Unexpected failure. → stdout + Sentry + Discord. Returns the Sentry event id. */
  error(fields: LogFields & { err?: unknown }, msg: string): string | undefined;

  /** Expected business milestone. → stdout + Discord. Never Sentry. */
  event(e: BusinessEvent): void;

  /** Returns a logger with these fields on every subsequent line. */
  child(fields: LogFields): Logger;
}
