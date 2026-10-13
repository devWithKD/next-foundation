import "server-only";

// Drivers live on their own subpaths (`./redis/ioredis`, `./redis/upstash`)
// so a project only type-checks and bundles the one it installs.
export type { RedisClient, RedisSetOptions } from "./client";
export { createRedisRateLimiter } from "./rate-limit";
export { LockAcquisitionError, withRedisLock, type LockOptions } from "./lock";
