import { ConflictError } from "../errors";
import type { Logger } from "../logger";
import type { RedisClient } from "./client";

// Releasing by key alone is unsafe: if our lock expired and someone else took
// it, a plain DEL releases theirs. The token makes release conditional, and
// delete-if-match must be atomic, hence Lua.
const RELEASE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

export type LockOptions = {
  /** How long the lock lives if the holder dies. Default 10 s. */
  ttlMs?: number;
  /** How long to wait for the lock before giving up. Default 5 s. */
  acquireTimeoutMs?: number;
  retryDelayMs?: number;
  /** Logs a failed release (the lock then expires on its own). */
  logger?: Logger;
};

/** Someone else holds the lock: a retryable conflict, not a server fault. */
export class LockAcquisitionError extends ConflictError {
  override code = "lock_timeout";
  constructor(readonly key: string) {
    super("This record is busy. Try again in a moment.");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn` while holding `lock:<key>`. Best-effort mutual exclusion for
 * work outside Postgres; inside a transaction prefer row or advisory locks
 * (`withAdvisoryLock` in `@kedar/foundation/db`).
 */
export async function withRedisLock<T>(
  redis: RedisClient,
  key: string,
  fn: () => Promise<T>,
  opts: LockOptions = {},
): Promise<T> {
  const ttlMs = opts.ttlMs ?? 10_000;
  const acquireTimeoutMs = opts.acquireTimeoutMs ?? 5_000;
  const retryDelayMs = opts.retryDelayMs ?? 100;
  const lockKey = `lock:${key}`;
  const token = crypto.randomUUID();

  const deadline = Date.now() + acquireTimeoutMs;
  let acquired = await redis.set(lockKey, token, { px: ttlMs, nx: true });
  while (!acquired && Date.now() < deadline) {
    await sleep(retryDelayMs);
    acquired = await redis.set(lockKey, token, { px: ttlMs, nx: true });
  }
  if (!acquired) throw new LockAcquisitionError(lockKey);

  try {
    return await fn();
  } finally {
    try {
      await redis.eval(RELEASE_SCRIPT, [lockKey], [token]);
    } catch (err) {
      opts.logger?.warn({ err, key: lockKey }, "lock_release_failed");
    }
  }
}
