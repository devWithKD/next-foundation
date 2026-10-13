# redis

A minimal `RedisClient` (`get`, `set` with `ex`/`px`/`nx`, `del`, `eval`), a
sliding-window rate limiter and a token-checked lock. Drivers live on their own
subpaths so a project type-checks and bundles only the one it installs.

```ts
import { createIoRedisClient } from "@kedar/foundation/redis/ioredis";   // TCP
import { createUpstashClient } from "@kedar/foundation/redis/upstash";   // HTTP
import { createRedisRateLimiter, withRedisLock } from "@kedar/foundation/redis";

const redis = createIoRedisClient(serverEnv.REDIS_URL);
export const rateLimiter = createRedisRateLimiter(redis, logger, { failOpen: true });

await withRedisLock(redis, `po:${id}`, () => doWork(), { ttlMs: 10_000, logger });
```

- **`failOpen` is a decision, not a default**: `true` lets requests through when Redis is down (fine for authenticated, non-login traffic); `false` fails them (use for login).
- The lock releases only if it still holds *its own* token, so an expired lock can't release someone else's. A timeout throws `LockAcquisitionError` (a 409, retryable). Inside a transaction prefer `withAdvisoryLock` from `db`.
- ioredis connects lazily (nothing opens during `next build`); in dev keep the client in a `globalThis` guard or every HMR reload leaks a connection.
- Upstash is created with `automaticDeserialization: false`: values are our own JSON strings.
- Redis is never the source of truth for business data.
