import "server-only";
import { Redis } from "@upstash/redis";
import type { RedisClient, RedisSetOptions } from "./client";

// A separate subpath (`@devwithkd/foundation/redis/upstash`) so projects that
// don't install @upstash/redis never type-check or bundle this file.

// Derived from the SDK's own signature so it tracks SDK versions.
type UpstashSetOptions = NonNullable<Parameters<Redis["set"]>[2]>;

function toUpstashSetOpts(opts?: RedisSetOptions): UpstashSetOptions | undefined {
  if (!opts) return undefined;
  // Each branch is exactly one variant of the SDK's union: ex XOR px.
  if (opts.px !== undefined) return opts.nx ? { px: opts.px, nx: true } : { px: opts.px };
  if (opts.ex !== undefined) return opts.nx ? { ex: opts.ex, nx: true } : { ex: opts.ex };
  if (opts.nx) return { nx: true };
  return undefined;
}

/** Upstash over HTTP (serverless-friendly, no connection to leak). */
export function createUpstashClient(opts: { url: string; token: string }): RedisClient {
  // Values are our own JSON strings. With the SDK default, `get` would parse
  // them and RedisCache would JSON.parse an object.
  const client = new Redis({ ...opts, automaticDeserialization: false });
  return {
    get: (key) => client.get<string>(key),
    async set(key, value, setOpts) {
      // "OK" on success, null when an nx write is skipped.
      return (await client.set(key, value, toUpstashSetOpts(setOpts))) !== null;
    },
    async del(...keys) {
      if (keys.length) await client.del(...keys);
    },
    eval: (script, keys, args) => client.eval(script, keys, args),
  };
}
