# cache

`CachePort` with two implementations. The default is `NoopCache`: add Redis
caching only after a measured slow query.

```ts
import { NoopCache, RedisCache } from "@kedar/foundation/cache";

export const cache = serverEnv.REDIS_URL ? new RedisCache(redis, logger) : new NoopCache();

const hit = await cache.get(key, schema);                       // validated, or null
if (!hit) await cache.withLock(key, async () => { /* fill */ }); // stampede protection
await cache.set(key, value, 60);
await cache.invalidate(key);
```

- **Redis failures are cache misses, never 500s.** Every read/write is wrapped; the caller falls through to the database.
- Values are validated with a zod schema on the way out. A payload from an older deploy (or corrupt JSON) is treated as a miss and deleted.
- Invalidation failures only mean stale-until-TTL.
