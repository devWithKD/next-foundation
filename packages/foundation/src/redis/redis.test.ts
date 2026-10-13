import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, RateLimitError } from "../errors";
import { fakeLogger } from "../../test/fakes";
import { downRedis, memoryRedis } from "../../test/redis";
import { createIoRedisClient } from "./ioredis";
import { createUpstashClient } from "./upstash";
import { LockAcquisitionError, withRedisLock } from "./lock";
import { createRedisRateLimiter } from "./rate-limit";

const ioCalls: unknown[][] = [];
const ioCtor = vi.fn();
vi.mock("ioredis", () => ({
  Redis: class {
    constructor(url: string, opts: unknown) {
      ioCtor(url, opts);
    }
    get = async (k: string) => (ioCalls.push(["get", k]), "v");
    set = async (...a: unknown[]) => (ioCalls.push(["set", ...a]), a.includes("NX") ? null : "OK");
    del = async (...k: string[]) => (ioCalls.push(["del", ...k]), k.length);
    eval = async (...a: unknown[]) => (ioCalls.push(["eval", ...a]), 1);
  },
}));

const upCalls: unknown[][] = [];
const upCtor = vi.fn();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(opts: unknown) {
      upCtor(opts);
    }
    get = async (k: string) => (upCalls.push(["get", k]), k === "missing" ? null : '{"a":1}');
    set = async (...a: unknown[]) => (upCalls.push(["set", ...a]), (a[2] as { nx?: boolean } | undefined)?.nx ? null : "OK");
    del = async (...k: string[]) => (upCalls.push(["del", ...k]), k.length);
    eval = async (...a: unknown[]) => (upCalls.push(["eval", ...a]), 0);
  },
}));

afterEach(() => {
  ioCalls.length = 0;
  upCalls.length = 0;
  vi.clearAllMocks();
});

describe("createIoRedisClient", () => {
  it("defers connecting to the first command", () => {
    createIoRedisClient("redis://x");
    expect(ioCtor).toHaveBeenCalledWith("redis://x", { lazyConnect: true });
  });

  it("maps set options to ioredis flags", async () => {
    const r = createIoRedisClient("redis://x");
    expect(await r.set("k", "v")).toBe(true);
    expect(await r.set("k", "v", { px: 50, nx: true })).toBe(false);
    await r.set("k", "v", { ex: 5 });
    expect(ioCalls.filter((c) => c[0] === "set")).toEqual([
      ["set", "k", "v"],
      ["set", "k", "v", "PX", 50, "NX"],
      ["set", "k", "v", "EX", 5],
    ]);
  });

  it("passes the key count to eval and skips empty del", async () => {
    const r = createIoRedisClient("redis://x");
    await r.eval("script", ["k1", "k2"], [1, "a"]);
    await r.del();
    expect(ioCalls).toEqual([["eval", "script", 2, "k1", "k2", 1, "a"]]);
  });
});

describe("createUpstashClient", () => {
  it("turns off automatic deserialization", async () => {
    const r = createUpstashClient({ url: "https://u", token: "t" });
    // The raw JSON string comes back; the SDK must not parse it for us.
    expect(await r.get("k")).toBe('{"a":1}');
    expect(await r.get("missing")).toBeNull();
    expect(upCtor).toHaveBeenCalledWith({ url: "https://u", token: "t", automaticDeserialization: false });
  });

  it("maps set options and reports skipped nx writes", async () => {
    const r = createUpstashClient({ url: "https://u", token: "t" });
    expect(await r.set("k", "v")).toBe(true);
    expect(await r.set("k", "v", { px: 50, nx: true })).toBe(false);
    await r.set("k", "v", { ex: 5 });
    expect(upCalls.filter((c) => c[0] === "set")).toEqual([
      ["set", "k", "v", undefined],
      ["set", "k", "v", { px: 50, nx: true }],
      ["set", "k", "v", { ex: 5 }],
    ]);
  });
});

describe("createRedisRateLimiter", () => {
  const args = { key: "so.block", subject: "user-1", perMinute: 10, requestId: "req-1" };

  it("allows when the script returns 1, with the documented key and args", async () => {
    const { redis, calls } = memoryRedis();
    redis.evalImpl = async () => 1;
    const { logger } = fakeLogger();
    await createRedisRateLimiter(redis, logger, { failOpen: true, now: () => 1000 }).enforce(args);
    expect(calls[0]?.args.slice(1)).toEqual([["ratelimit:so.block:user-1"], [1000, 60_000, 10, "req-1"]]);
  });

  it("throws RateLimitError when the script returns 0", async () => {
    const { redis } = memoryRedis();
    redis.evalImpl = async () => 0;
    const { logger } = fakeLogger();
    await expect(createRedisRateLimiter(redis, logger, { failOpen: true }).enforce(args)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("fails open and warns when Redis is down", async () => {
    const { logger, calls } = fakeLogger();
    await createRedisRateLimiter(downRedis(), logger, { failOpen: true }).enforce(args);
    expect(calls).toMatchObject([{ level: "warn", msg: "rate_limit_check_failed_open" }]);
  });

  it("fails closed when failOpen is false", async () => {
    const { logger } = fakeLogger();
    await expect(createRedisRateLimiter(downRedis(), logger, { failOpen: false }).enforce(args)).rejects.toThrow("ECONNREFUSED");
  });
});

describe("withRedisLock", () => {
  it("holds the lock during fn and releases it after", async () => {
    const { redis, store } = memoryRedis();
    const result = await withRedisLock(redis, "po:1", async () => {
      expect(store.has("lock:po:1")).toBe(true);
      return 42;
    });
    expect(result).toBe(42);
    expect(store.has("lock:po:1")).toBe(false);
  });

  it("releases when fn throws", async () => {
    const { redis, store } = memoryRedis();
    await expect(withRedisLock(redis, "po:1", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(store.has("lock:po:1")).toBe(false);
  });

  it("does not release a lock someone else now holds", async () => {
    const { redis, store } = memoryRedis();
    await withRedisLock(redis, "po:1", async () => {
      store.set("lock:po:1", "someone-else"); // ours expired, theirs was taken
    });
    expect(store.get("lock:po:1")).toBe("someone-else");
  });

  it("throws a retryable conflict when the lock stays taken", async () => {
    const { redis, store } = memoryRedis();
    store.set("lock:po:1", "other");
    const fn = vi.fn(async () => 1);
    const err = await withRedisLock(redis, "po:1", fn, { acquireTimeoutMs: 30, retryDelayMs: 5 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LockAcquisitionError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ code: "lock_timeout", httpStatus: 409 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("acquires once the holder releases", async () => {
    const { redis, store } = memoryRedis();
    store.set("lock:po:1", "other");
    setTimeout(() => store.delete("lock:po:1"), 15);
    expect(await withRedisLock(redis, "po:1", async () => "ok", { acquireTimeoutMs: 500, retryDelayMs: 5 })).toBe("ok");
  });

  it("logs a failed release but still returns fn's result", async () => {
    const { redis } = memoryRedis();
    redis.evalImpl = async () => {
      throw new Error("down");
    };
    const { logger, calls } = fakeLogger();
    expect(await withRedisLock(redis, "po:1", async () => "ok", { logger })).toBe("ok");
    expect(calls).toMatchObject([{ level: "warn", msg: "lock_release_failed", fields: { key: "lock:po:1" } }]);
  });
});
