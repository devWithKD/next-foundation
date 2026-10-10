import { describe, expect, it, vi } from "vitest";
import type { BaseActor } from "../authz";
import { UnauthorizedError } from "../errors";
import { fakeLogger, REQUEST_ID, testActor } from "../../test/fakes";
import { defineAuthContext } from "./index";

type Session = { userId: string };

function setup(over: { trustProxy?: boolean; session?: Session | null; actor?: BaseActor | null } = {}) {
  const { logger, calls } = fakeLogger();
  const getSession = vi.fn(async (_h: Headers) =>
    over.session === undefined ? ({ userId: "user-1" } as Session) : over.session,
  );
  const toActor = vi.fn(async (_s: Session, _m: unknown) =>
    over.actor === undefined ? testActor : over.actor,
  );
  const ctx = defineAuthContext<Session, BaseActor>({
    getSession,
    toActor,
    ipHeaders: ["x-forwarded-for", "x-real-ip"],
    trustProxy: over.trustProxy ?? true,
    logger,
  });
  return { ctx, calls, getSession, toActor };
}

const h = (init: Record<string, string> = {}) => new Headers(init);

describe("meta: requestId", () => {
  it("keeps a valid UUID from x-request-id", () => {
    const { ctx, calls } = setup();
    expect(ctx.meta(h({ "x-request-id": REQUEST_ID })).requestId).toBe(REQUEST_ID);
    expect(calls).toHaveLength(0);
  });

  it("generates one and warns when missing", () => {
    const { ctx, calls } = setup();
    const { requestId } = ctx.meta(h());
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls).toEqual([{ level: "warn", fields: {}, msg: "missing_request_id" }]);
  });

  it("does not trust a malformed value", () => {
    const { ctx } = setup();
    const { requestId } = ctx.meta(h({ "x-request-id": "not-a-uuid" }));
    expect(requestId).not.toBe("not-a-uuid");
  });
});

describe("meta: ip and user agent", () => {
  it("is null when the proxy is not trusted (the client controls the header)", () => {
    const { ctx } = setup({ trustProxy: false });
    expect(ctx.meta(h({ "x-forwarded-for": "9.9.9.9" })).ipAddress).toBeNull();
  });

  it("takes the first address of the first present header", () => {
    const { ctx } = setup();
    const m = ctx.meta(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1", "x-real-ip": "8.8.8.8" }));
    expect(m.ipAddress).toBe("9.9.9.9");
  });

  it("falls through to the next header", () => {
    const { ctx } = setup();
    expect(ctx.meta(h({ "x-real-ip": "8.8.8.8" })).ipAddress).toBe("8.8.8.8");
  });

  it("is null with no headers, and reads the user agent", () => {
    const { ctx } = setup();
    expect(ctx.meta(h()).ipAddress).toBeNull();
    expect(ctx.meta(h({ "user-agent": "okhttp/4" })).userAgent).toBe("okhttp/4");
    expect(ctx.meta(h()).userAgent).toBeNull();
  });
});

describe("require / optional", () => {
  it("returns meta plus the actor, and passes headers and meta through", async () => {
    const { ctx, getSession, toActor } = setup();
    const headers = h({ "x-request-id": REQUEST_ID, "user-agent": "vitest" });
    const result = await ctx.require(headers);
    expect(result).toMatchObject({ requestId: REQUEST_ID, userAgent: "vitest", actor: testActor });
    expect(getSession).toHaveBeenCalledWith(headers);
    expect(toActor).toHaveBeenCalledWith(
      { userId: "user-1" },
      expect.objectContaining({ requestId: REQUEST_ID }),
    );
  });

  it("require throws UnauthorizedError without a session", async () => {
    const { ctx } = setup({ session: null });
    await expect(ctx.require(h())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("treats toActor returning null as signed out (e.g. a deleted user)", async () => {
    const { ctx } = setup({ actor: null });
    await expect(ctx.require(h())).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await ctx.optional(h())).toBeNull();
  });

  it("optional returns null instead of throwing", async () => {
    const { ctx } = setup({ session: null });
    expect(await ctx.optional(h())).toBeNull();
  });
});
