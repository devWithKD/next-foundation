import type { BaseActor } from "../src/authz";
import type { AuthContext, RequestContext } from "../src/context";
import { UnauthorizedError } from "../src/errors";
import type { LogFields, Logger } from "../src/logger";

export type LogCall = { level: string; fields: LogFields; msg: string };

/** A Logger that records every call. `child` shares the record and merges bound fields. */
export function fakeLogger(sentryId: string | undefined = "abcdef12-0000-0000-0000-000000000000") {
  const calls: LogCall[] = [];
  const build = (bound: LogFields): Logger => ({
    debug: (fields, msg) => void calls.push({ level: "debug", fields: { ...bound, ...fields }, msg }),
    info: (fields, msg) => void calls.push({ level: "info", fields: { ...bound, ...fields }, msg }),
    warn: (fields, msg) => void calls.push({ level: "warn", fields: { ...bound, ...fields }, msg }),
    error: (fields, msg) => {
      calls.push({ level: "error", fields: { ...bound, ...fields }, msg });
      return sentryId;
    },
    event: () => {},
    child: (fields) => build({ ...bound, ...fields }),
  });
  return { logger: build({}), calls };
}

export const testActor: BaseActor = {
  userId: "user-1",
  label: "Test User (test)",
  role: null,
  permissions: new Set(),
};

export const REQUEST_ID = "11111111-1111-4111-8111-111111111111";

/** Signed in unless the request carries `x-test-auth: none`. */
export function fakeContext(): AuthContext<BaseActor> {
  const meta = () => ({ requestId: REQUEST_ID, ipAddress: "1.2.3.4", userAgent: "vitest" });
  const optional = async (h: Headers): Promise<RequestContext<BaseActor> | null> =>
    h.get("x-test-auth") === "none" ? null : { ...meta(), actor: testActor };
  return {
    meta,
    optional,
    require: async (h) => {
      const ctx = await optional(h);
      if (!ctx) throw new UnauthorizedError();
      return ctx;
    },
  };
}
