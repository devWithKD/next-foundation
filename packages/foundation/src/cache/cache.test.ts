import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeLogger } from "../../test/fakes";
import { downRedis, memoryRedis } from "../../test/redis";
import { NoopCache, RedisCache } from ".";

const schema = z.object({ id: z.string(), qty: z.number() });

describe("NoopCache", () => {
  it("never hits and runs fn under withLock", async () => {
    const cache = new NoopCache();
    await cache.set("k", { id: "a", qty: 1 }, 60);
    expect(await cache.get("k", schema)).toBeNull();
    expect(await cache.withLock("k", async () => 7)).toBe(7);
  });
});

describe("RedisCache", () => {
  it("round-trips a value with a TTL", async () => {
    const { redis, calls } = memoryRedis();
    const cache = new RedisCache(redis, fakeLogger().logger);
    await cache.set("k", { id: "a", qty: 1 }, 60);
    expect(await cache.get("k", schema)).toEqual({ id: "a", qty: 1 });
    expect(calls.find((c) => c.op === "set")?.args[2]).toEqual({ ex: 60 });
  });

  it("treats a shape mismatch as a miss and deletes the key", async () => {
    const { redis, store } = memoryRedis();
    store.set("k", JSON.stringify({ id: "a" }));
    expect(await new RedisCache(redis, fakeLogger().logger).get("k", schema)).toBeNull();
    expect(store.has("k")).toBe(false);
  });

  it("treats corrupt JSON as a miss and deletes the key", async () => {
    const { redis, store } = memoryRedis();
    store.set("k", "{not json");
    expect(await new RedisCache(redis, fakeLogger().logger).get("k", schema)).toBeNull();
    expect(store.has("k")).toBe(false);
  });

  it("degrades to a miss when Redis is down, and never throws", async () => {
    const { logger, calls } = fakeLogger();
    const cache = new RedisCache(downRedis(), logger);
    expect(await cache.get("k", schema)).toBeNull();
    await cache.set("k", { id: "a", qty: 1 }, 60);
    await cache.invalidate("k");
    expect(calls.map((c) => c.msg)).toEqual(["cache_get_failed", "cache_set_failed", "cache_invalidate_failed"]);
  });

  it("locks fills under a cache-namespaced key", async () => {
    const { redis, store } = memoryRedis();
    const seen = vi.fn();
    await new RedisCache(redis, fakeLogger().logger).withLock("sku:1", async () => seen([...store.keys()]));
    expect(seen).toHaveBeenCalledWith(["lock:cache:sku:1"]);
  });
});
