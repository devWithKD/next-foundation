import type { RateLimiter } from "../adapters";
import { RateLimitError } from "../errors";
import type { Logger } from "../logger";
import type { RedisClient } from "./client";

// Atomic sliding window. Lua because check-then-increment in two round trips
// is a race: two requests can both read "under limit" before either writes.
const SLIDING_WINDOW_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1] - ARGV[2])
  local count = redis.call('ZCARD', KEYS[1])
  if count >= tonumber(ARGV[3]) then return 0 end
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return 1
`;

const WINDOW_MS = 60_000;

export function createRedisRateLimiter(
  redis: RedisClient,
  logger: Logger,
  opts: {
    /**
     * What a Redis outage means. `true`: let the request through (authenticated,
     * non-login traffic). `false`: fail the request. Decide per limiter; never let
     * an outage silently pick one.
     */
    failOpen: boolean;
    now?: () => number;
  },
): RateLimiter {
  const now = opts.now ?? Date.now;
  return {
    async enforce({ key, subject, perMinute, requestId }) {
      let allowed: unknown;
      try {
        allowed = await redis.eval(
          SLIDING_WINDOW_SCRIPT,
          [`ratelimit:${key}:${subject}`],
          [now(), WINDOW_MS, perMinute, requestId],
        );
      } catch (err) {
        if (!opts.failOpen) throw err;
        logger.warn({ err, key }, "rate_limit_check_failed_open");
        return;
      }
      if (Number(allowed) === 0) {
        throw new RateLimitError("Too many requests. Try again in a minute.");
      }
    },
  };
}
