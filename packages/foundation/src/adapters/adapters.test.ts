import { redirect } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from "../errors";
import { defineListQuery } from "../list";
import { fakeContext, fakeLogger, REQUEST_ID } from "../../test/fakes";
import { createAdapters, type RateLimiter } from "./index";

function setup(over: { signedIn?: boolean; rateLimiter?: RateLimiter; onDenied?: () => Promise<void> } = {}) {
  const { logger, calls } = fakeLogger();
  const scheduled: Promise<void>[] = [];
  const onDenied = vi.fn(over.onDenied ?? (async () => {}));
  const adapters = createAdapters({
    context: fakeContext(),
    logger,
    loginPath: "/login",
    rateLimiter: over.rateLimiter,
    onDenied,
    getHeaders: async () => new Headers(over.signedIn === false ? { "x-test-auth": "none" } : {}),
    // Run the task now and keep the promise, so tests can await it.
    schedule: (task) => void scheduled.push(task()),
  });
  return { ...adapters, calls, onDenied, flush: () => Promise.all(scheduled) };
}

const json = async (r: Response) => ({ status: r.status, body: await r.json() });

describe("createAction", () => {
  const input = z.object({ title: z.string().min(2) });

  it("returns the handler's data", async () => {
    const { createAction } = setup();
    const action = createAction({ name: "x.create", input, handler: async (i) => ({ id: i.title }) });
    expect(await action({ title: "ab" })).toEqual({ ok: true, data: { id: "ab" } });
  });

  it("hands the handler the validated input and the context", async () => {
    const { createAction } = setup();
    const handler = vi.fn(async () => 1);
    await createAction({ name: "x.create", input, handler })({ title: "ab" });
    expect(handler).toHaveBeenCalledWith(
      { title: "ab" },
      expect.objectContaining({ requestId: REQUEST_ID, actor: expect.objectContaining({ userId: "user-1" }) }),
    );
  });

  it("turns a Zod failure into field errors", async () => {
    const { createAction } = setup();
    const action = createAction({ name: "x.create", input, handler: async () => 1 });
    expect(await action({ title: "a" })).toMatchObject({
      ok: false,
      code: "validation",
      fieldErrors: { title: [expect.any(String)] },
    });
  });

  it("turns a ValidationError from the handler into field errors", async () => {
    const { createAction } = setup();
    const action = createAction({
      name: "x.create",
      input,
      handler: async () => {
        throw new ValidationError({ enabledRoles: ["Not available"] });
      },
    });
    expect(await action({ title: "ab" })).toMatchObject({
      ok: false,
      code: "validation",
      fieldErrors: { enabledRoles: ["Not available"] },
    });
  });

  it("returns code unauthorized without a session, and never runs the handler", async () => {
    const { createAction } = setup({ signedIn: false });
    const handler = vi.fn(async () => 1);
    const result = await createAction({ name: "x.create", input, handler })({ title: "ab" });
    expect(result).toMatchObject({ ok: false, code: "unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("exposes AppError messages with their code", async () => {
    const { createAction, calls } = setup();
    const action = createAction({
      name: "x.create",
      input,
      handler: async () => {
        throw new ConflictError("Already exists");
      },
    });
    expect(await action({ title: "ab" })).toEqual({ ok: false, code: "conflict", message: "Already exists" });
    expect(calls.some((c) => c.level === "info" && c.msg === "handled_app_error")).toBe(true);
  });

  it("records a denial after the response, with the permission and where", async () => {
    const { createAction, onDenied, flush } = setup();
    const action = createAction({
      name: "so.block",
      input,
      handler: async () => {
        throw new ForbiddenError("No", { permission: "so:block_qty" });
      },
    });
    expect(await action({ title: "ab" })).toMatchObject({ ok: false, code: "forbidden", message: "No" });
    await flush();
    expect(onDenied).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: REQUEST_ID }),
      { where: "so.block", permission: "so:block_qty", message: "No" },
    );
  });

  it("a failing onDenied never breaks the response", async () => {
    const { createAction, calls, flush } = setup({
      onDenied: async () => {
        throw new Error("audit db down");
      },
    });
    const action = createAction({
      name: "x.do",
      input,
      handler: async () => {
        throw new ForbiddenError("No");
      },
    });
    expect(await action({ title: "ab" })).toMatchObject({ ok: false, code: "forbidden" });
    await flush();
    expect(calls.some((c) => c.level === "warn" && c.msg === "on_denied_failed")).toBe(true);
  });

  it("hides unknown errors behind a generic message with a reference", async () => {
    const { createAction, calls } = setup();
    const action = createAction({
      name: "x.create",
      input,
      handler: async () => {
        throw new Error('column "secret_col" does not exist');
      },
    });
    const result = await action({ title: "ab" });
    expect(result).toEqual({
      ok: false,
      code: "internal",
      message: "Something went wrong (ref abcdef12)",
      ref: "abcdef12",
    });
    expect(JSON.stringify(result)).not.toContain("secret_col");
    const logged = calls.find((c) => c.level === "error");
    expect(logged?.fields).toMatchObject({ where: "x.create", requestId: REQUEST_ID, actorId: "user-1" });
  });

  it("rethrows Next's redirect instead of reporting it as a crash", async () => {
    const { createAction, calls } = setup();
    const action = createAction({
      name: "x.create",
      input,
      handler: async () => redirect("/somewhere"),
    });
    await expect(action({ title: "ab" })).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(calls.some((c) => c.level === "error")).toBe(false);
  });
});

describe("createAction: rate limiting", () => {
  const input = z.object({ n: z.number() });

  it("enforces after identity and before parsing", async () => {
    const enforce = vi.fn(async () => {});
    const { createAction } = setup({ rateLimiter: { enforce } });
    const action = createAction({
      name: "x.do",
      input,
      rateLimit: { key: "x:write", perMinute: 5 },
      handler: async () => 1,
    });
    // Invalid input: the limiter must still have been consulted first.
    await action({ n: "nope" });
    expect(enforce).toHaveBeenCalledWith({
      key: "x:write",
      perMinute: 5,
      subject: "user-1",
      requestId: REQUEST_ID,
    });
  });

  it("does not consult the limiter for signed-out callers", async () => {
    const enforce = vi.fn(async () => {});
    const { createAction } = setup({ signedIn: false, rateLimiter: { enforce } });
    await createAction({ name: "x.do", input, rateLimit: { key: "k", perMinute: 1 }, handler: async () => 1 })({ n: 1 });
    expect(enforce).not.toHaveBeenCalled();
  });

  it("returns rate_limit and skips the handler when over the limit", async () => {
    const { createAction } = setup({
      rateLimiter: {
        enforce: async () => {
          throw new RateLimitError("Slow down");
        },
      },
    });
    const handler = vi.fn(async () => 1);
    const result = await createAction({ name: "x.do", input, rateLimit: { key: "k", perMinute: 1 }, handler })({ n: 1 });
    expect(result).toMatchObject({ ok: false, code: "rate_limit", message: "Slow down" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("no limiter configured means no limiting", async () => {
    const { createAction } = setup();
    const result = await createAction({ name: "x.do", input, rateLimit: { key: "k", perMinute: 1 }, handler: async () => 7 })({ n: 1 });
    expect(result).toEqual({ ok: true, data: 7 });
  });
});

describe("createRoute", () => {
  const get = (url = "http://x/api/things", init?: RequestInit) => new Request(url, init);

  it("wraps data in { data } with status 200", async () => {
    const { createRoute } = setup();
    const route = createRoute({ name: "t.get", handler: async () => ({ hello: "world" }) });
    expect(await json(await route(get()))).toEqual({ status: 200, body: { data: { hello: "world" } } });
  });

  it("uses a custom success status", async () => {
    const { createRoute } = setup();
    const route = createRoute({ name: "t.create", status: 201, handler: async () => ({ id: 1 }) });
    expect((await route(get())).status).toBe(201);
  });

  it("parses the query string through a list schema", async () => {
    const { createRoute } = setup();
    const list = defineListQuery({
      filters: { q: z.string().optional() },
      sortable: ["title"],
      defaultSort: [],
    });
    const route = createRoute({ name: "t.list", query: list, handler: async ({ query }) => query });
    const res = await json(await route(get("http://x/api/things?q=abc&page=2&sort=title:desc")));
    expect(res.body.data).toMatchObject({ q: "abc", page: 2, sort: [{ field: "title", dir: "desc" }] });
  });

  it("parses route params from the segment", async () => {
    const { createRoute } = setup();
    const route = createRoute({
      name: "t.get",
      params: z.object({ id: z.uuid() }),
      handler: async ({ params }) => params,
    });
    const id = "22222222-2222-4222-8222-222222222222";
    const res = await json(await route(get(), { params: Promise.resolve({ id }) }));
    expect(res.body.data).toEqual({ id });
  });

  it("parses a JSON body, and 422s on invalid JSON", async () => {
    const { createRoute } = setup();
    const route = createRoute({
      name: "t.create",
      body: z.object({ title: z.string() }),
      handler: async ({ body }) => body,
    });
    const ok = await route(get("http://x/api", { method: "POST", body: JSON.stringify({ title: "hi" }) }));
    expect((await json(ok)).body.data).toEqual({ title: "hi" });

    const bad = await json(await route(get("http://x/api", { method: "POST", body: "{nope" })));
    expect(bad.status).toBe(422);
    expect(bad.body.error).toMatchObject({ code: "validation", fieldErrors: { _root: ["Invalid JSON body"] } });
  });

  it("422s with field errors on schema failure", async () => {
    const { createRoute } = setup();
    const route = createRoute({ name: "t.create", body: z.object({ title: z.string() }), handler: async () => 1 });
    const res = await json(await route(get("http://x/api", { method: "POST", body: JSON.stringify({ title: 5 }) })));
    expect(res.status).toBe(422);
    expect(res.body.error.fieldErrors.title).toBeDefined();
  });

  it("passes a handler-returned Response straight through (downloads)", async () => {
    const { createRoute } = setup();
    const route = createRoute({
      name: "t.file",
      handler: async () => new Response("csv,data", { headers: { "content-type": "text/csv" } }),
    });
    const res = await route(get());
    expect(res.headers.get("content-type")).toBe("text/csv");
    expect(await res.text()).toBe("csv,data");
  });

  it("401s without a session", async () => {
    const { createRoute } = setup({ signedIn: false });
    const route = createRoute({ name: "t.get", handler: async () => 1 });
    // fakeContext reads auth from the request headers on routes
    const res = await json(await route(get("http://x/api", { headers: { "x-test-auth": "none" } })));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("403s and records the denial", async () => {
    const { createRoute, onDenied, flush } = setup();
    const route = createRoute({
      name: "t.get",
      handler: async () => {
        throw new ForbiddenError("No", { permission: "audit_log:list" });
      },
    });
    const res = await json(await route(get()));
    expect(res).toMatchObject({ status: 403, body: { error: { code: "forbidden", message: "No" } } });
    await flush();
    expect(onDenied).toHaveBeenCalledWith(expect.anything(), { where: "t.get", permission: "audit_log:list", message: "No" });
  });

  it("maps an AppError to its own HTTP status", async () => {
    const { createRoute } = setup();
    const route = createRoute({
      name: "t.get",
      handler: async () => {
        throw new NotFoundError("Role template not found");
      },
    });
    const res = await json(await route(get()));
    expect(res).toEqual({ status: 404, body: { error: { code: "not_found", message: "Role template not found" } } });
  });

  it("500s unknown errors without leaking the message", async () => {
    const { createRoute } = setup();
    const route = createRoute({
      name: "t.get",
      handler: async () => {
        throw new Error("relation \"secret\" does not exist");
      },
    });
    const res = await json(await route(get()));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal");
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });

  it("429s when rate limited, keyed by user", async () => {
    const enforce = vi.fn(async () => {
      throw new RateLimitError("Slow down");
    });
    const { createRoute } = setup({ rateLimiter: { enforce } });
    const route = createRoute({ name: "t.get", rateLimit: { key: "t:read", perMinute: 60 }, handler: async () => 1 });
    const res = await json(await route(get()));
    expect(res.status).toBe(429);
    expect(enforce).toHaveBeenCalledWith(expect.objectContaining({ subject: "user-1" }));
  });

  it("rethrows Next's redirect", async () => {
    const { createRoute } = setup();
    const route = createRoute({ name: "t.get", handler: async () => redirect("/x") });
    await expect(route(get())).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});

describe("createPublicRoute", () => {
  it("runs without a session and hands over meta", async () => {
    const { createPublicRoute } = setup({ signedIn: false });
    const route = createPublicRoute({ name: "hook.in", handler: async ({ meta }) => meta.requestId });
    const res = await json(await route(new Request("http://x/hook", { headers: { "x-test-auth": "none" } })));
    expect(res).toEqual({ status: 200, body: { data: REQUEST_ID } });
  });

  it("rate limits by IP (or 'anon')", async () => {
    const enforce = vi.fn(async () => {});
    const { createPublicRoute } = setup({ rateLimiter: { enforce } });
    const route = createPublicRoute({ name: "hook.in", rateLimit: { key: "hook", perMinute: 10 }, handler: async () => 1 });
    await route(new Request("http://x/hook"));
    // fakeContext reports ipAddress 1.2.3.4
    expect(enforce).toHaveBeenCalledWith(expect.objectContaining({ subject: "1.2.3.4" }));
  });

  it("translates errors the same way", async () => {
    const { createPublicRoute } = setup();
    const route = createPublicRoute({
      name: "hook.in",
      body: z.object({ ok: z.literal(true) }),
      handler: async () => 1,
    });
    const res = await json(await route(new Request("http://x/hook", { method: "POST", body: "{}" })));
    expect(res.status).toBe(422);
  });
});

describe("requirePage", () => {
  it("returns the context when signed in", async () => {
    const { requirePage } = setup();
    expect(await requirePage()).toMatchObject({ requestId: REQUEST_ID });
  });

  it("redirects to the login path when signed out", async () => {
    const { requirePage } = setup({ signedIn: false });
    await expect(requirePage()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;.*\/login;/),
    });
  });
});
