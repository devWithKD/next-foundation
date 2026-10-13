import "server-only";
import type { z } from "zod";
import type { Logger } from "../logger";
import { withRedisLock, type LockOptions } from "../redis/lock";
import type { RedisClient } from "../redis/client";

export interface CachePort {
  get<T>(key: string, schema: z.ZodType<T>): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  invalidate(...keys: string[]): Promise<void>;
  /** Serialises cache fills for one key (stampede protection). */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/** The default: Redis caching comes only after a measured slow query. */
export class NoopCache implements CachePort {
  async get<T>(_key: string, _schema: z.ZodType<T>): Promise<T | null> {
    return null;
  }
  async set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {}
  async invalidate(..._keys: string[]): Promise<void> {}
  async withLock<T>(_key: string, fn: () => Promise<T>): Promise<T> {
    return fn(); // nothing else is caching, so nothing to coordinate with
  }
}

/**
 * Every Redis failure degrades to a cache miss (the caller reads the DB);
 * a cache must never turn into a 500.
 */
export class RedisCache implements CachePort {
  constructor(
    private readonly redis: RedisClient,
    private readonly logger: Logger,
    private readonly lockOptions: Omit<LockOptions, "logger"> = {},
  ) {}

  async get<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
    let raw: string | null;
    try {
      raw = await this.redis.get(key);
    } catch (err) {
      this.logger.warn({ err, key }, "cache_get_failed");
      return null;
    }
    if (raw === null) return null;

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = undefined; // corrupt payload: same as a shape mismatch below
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      // Written by an older deploy with a different shape (or corrupt).
      // Treat as a miss; never return unvalidated data.
      await this.invalidate(key);
      return null;
    }
    return parsed.data;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (err) {
      this.logger.warn({ err, key }, "cache_set_failed");
    }
  }

  async invalidate(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      // Worst case: stale until the TTL. Accepted trade-off.
      this.logger.warn({ err, keys }, "cache_invalidate_failed");
    }
  }

  withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return withRedisLock(this.redis, `cache:${key}`, fn, { ...this.lockOptions, logger: this.logger });
  }
}
