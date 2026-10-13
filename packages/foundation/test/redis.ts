import type { RedisClient, RedisSetOptions } from "../src/redis/client";

/**
 * In-memory RedisClient. TTLs are ignored. `eval` only understands the lock
 * release script (compare-and-delete); override it for anything else.
 */
export function memoryRedis() {
  const store = new Map<string, string>();
  const calls: { op: string; args: unknown[] }[] = [];
  const redis: RedisClient & { evalImpl?: RedisClient["eval"] } = {
    async get(key) {
      calls.push({ op: "get", args: [key] });
      return store.get(key) ?? null;
    },
    async set(key, value, opts?: RedisSetOptions) {
      calls.push({ op: "set", args: [key, value, opts] });
      if (opts?.nx && store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    async del(...keys) {
      calls.push({ op: "del", args: keys });
      for (const k of keys) store.delete(k);
    },
    async eval(script, keys, args) {
      calls.push({ op: "eval", args: [script, keys, args] });
      if (redis.evalImpl) return redis.evalImpl(script, keys, args);
      const [key] = keys;
      if (key !== undefined && store.get(key) === String(args[0])) {
        store.delete(key);
        return 1;
      }
      return 0;
    },
  };
  return { redis, store, calls };
}

/** A RedisClient whose every call rejects (Redis down). */
export function downRedis(): RedisClient {
  const fail = async (): Promise<never> => {
    throw new Error("ECONNREFUSED");
  };
  return { get: fail, set: fail, del: fail, eval: fail };
}
