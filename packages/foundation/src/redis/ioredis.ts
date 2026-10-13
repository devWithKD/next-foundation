import "server-only";
import { Redis } from "ioredis";
import type { RedisClient, RedisSetOptions } from "./client";

// A separate subpath (`@devwithkd/foundation/redis/ioredis`) so projects that
// don't install ioredis never type-check or bundle this file.

function performSet(client: Redis, key: string, value: string, opts?: RedisSetOptions) {
  // ioredis types `set` as one overload per literal flag combination, not an
  // options bag, so branch onto the typed overloads.
  const { ex, px, nx } = opts ?? {};
  if (nx && px !== undefined) return client.set(key, value, "PX", px, "NX");
  if (nx && ex !== undefined) return client.set(key, value, "EX", ex, "NX");
  if (nx) return client.set(key, value, "NX");
  if (px !== undefined) return client.set(key, value, "PX", px);
  if (ex !== undefined) return client.set(key, value, "EX", ex);
  return client.set(key, value);
}

/**
 * ioredis over TCP. Connects on the first command (`lazyConnect`), so
 * importing it during `next build` opens nothing. In dev, keep the result in
 * a `globalThis` guard, or every HMR re-evaluation opens a new connection.
 */
export function createIoRedisClient(url: string): RedisClient {
  const client = new Redis(url, { lazyConnect: true });
  return {
    get: (key) => client.get(key),
    async set(key, value, opts) {
      return (await performSet(client, key, value, opts)) === "OK";
    },
    async del(...keys) {
      if (keys.length) await client.del(...keys);
    },
    eval: (script, keys, args) => client.eval(script, keys.length, ...keys, ...args),
  };
}
