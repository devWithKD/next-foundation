export interface RedisSetOptions {
  /** Expire after N seconds. */
  ex?: number;
  /** Expire after N milliseconds. */
  px?: number;
  /** Only set if the key does not already exist. */
  nx?: boolean;
}

// Minimal surface both drivers satisfy. Extend only when a real caller
// needs something neither exposes identically.
export interface RedisClient {
  get(key: string): Promise<string | null>;
  /** Returns false when an `nx` write was skipped. */
  set(key: string, value: string, opts?: RedisSetOptions): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown>;
}
