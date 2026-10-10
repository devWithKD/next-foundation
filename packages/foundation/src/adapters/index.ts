import "server-only";
import { headers as nextHeaders } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import type { BaseActor } from "../authz";
import type { AuthContext, RequestContext, RequestMeta } from "../context";
import { ForbiddenError, UnauthorizedError, ValidationError, isAppError } from "../errors";
import { fromSearchParams } from "../list";
import type { Logger } from "../logger";
import type { ActionResult, ErrorPayload } from "../result";

export type RateLimiter = {
  /** Throws RateLimitError when the subject is over the limit. */
  enforce(opts: {
    key: string;
    subject: string;
    perMinute: number;
    requestId: string;
  }): Promise<void>;
};

type SegmentParams = Record<string, string | string[] | undefined>;
type Segment = { params: Promise<SegmentParams> };
type Failure = { status: number; payload: ErrorPayload };
type RateLimit = { key: string; perMinute: number };

export function createAdapters<A extends BaseActor>(opts: {
  context: AuthContext<A>;
  logger: Logger;
  loginPath: string;
  rateLimiter?: RateLimiter;
  /** Called for every ForbiddenError: projects record an `authz.denied` audit row here. */
  onDenied?: (
    ctx: RequestContext<A>,
    info: { where: string; permission?: string; message: string },
  ) => Promise<void>;
  /** Injection points for tests. */
  getHeaders?: () => Promise<Headers>;
  schedule?: (task: () => Promise<void>) => void;
}) {
  const { context, logger, rateLimiter } = opts;
  const getHeaders = opts.getHeaders ?? (() => nextHeaders());
  const schedule = opts.schedule ?? ((task) => after(task));

  /** Fire-and-forget that survives the response, and never throws into it. */
  function runAfter(task: () => Promise<void>, what: string) {
    schedule(async () => {
      try {
        await task();
      } catch (err) {
        logger.warn({ err }, `${what}_failed`);
      }
    });
  }

  /** The one place errors become responses. Same table for actions and routes. */
  function translate(
    e: unknown,
    scope: { where: string; requestId: string | undefined; ctx: RequestContext<A> | null },
  ): Failure {
    const log = logger.child({
      where: scope.where,
      requestId: scope.requestId,
      actorId: scope.ctx?.actor.userId,
    });

    if (e instanceof z.ZodError) {
      return {
        status: 422,
        payload: {
          code: "validation",
          message: "Check the form",
          fieldErrors: z.flattenError(e).fieldErrors as Record<string, string[]>,
        },
      };
    }
    if (e instanceof ValidationError) {
      return {
        status: 422,
        payload: { code: "validation", message: "Check the form", fieldErrors: e.fieldErrors },
      };
    }
    if (e instanceof UnauthorizedError) {
      return { status: 401, payload: { code: e.code, message: e.message } };
    }
    if (e instanceof ForbiddenError) {
      const permission = typeof e.meta?.permission === "string" ? e.meta.permission : undefined;
      log.info({ code: e.code, permission }, "forbidden");
      const ctx = scope.ctx;
      if (ctx && opts.onDenied) {
        const onDenied = opts.onDenied;
        runAfter(
          () => onDenied(ctx, { where: scope.where, permission, message: e.message }),
          "on_denied",
        );
      }
      return { status: 403, payload: { code: e.code, message: e.message } };
    }
    if (isAppError(e) && e.expose) {
      log.info({ code: e.code }, "handled_app_error");
      return { status: e.httpStatus, payload: { code: e.code, message: e.message } };
    }

    // Unexpected. Could be a Postgres error naming your columns: never forward e.message.
    const sentryId = log.error({ err: e }, "unhandled_error");
    const ref = sentryId?.slice(0, 8);
    return {
      status: 500,
      payload: {
        code: "internal",
        message: ref ? `Something went wrong (ref ${ref})` : "Something went wrong",
        ...(ref ? { ref } : {}),
      },
    };
  }

  async function limit(rateLimit: RateLimit | undefined, subject: string, requestId: string) {
    if (rateLimit && rateLimiter) await rateLimiter.enforce({ ...rateLimit, subject, requestId });
  }

  function createAction<I, O>(def: {
    name: string;
    input: z.ZodType<I>;
    rateLimit?: RateLimit;
    handler: (input: I, ctx: RequestContext<A>) => Promise<O>;
  }): (raw: unknown) => Promise<ActionResult<O>> {
    return async (raw) => {
      // Declared outside the try so the catch can still report them.
      let ctx: RequestContext<A> | null = null;
      try {
        // Order is deliberate: identity → throttle → parse. Parsing untrusted
        // input before throttling lets garbage make you do work.
        ctx = await context.require(await getHeaders());
        await limit(def.rateLimit, ctx.actor.userId, ctx.requestId);
        const input = def.input.parse(raw);
        return { ok: true, data: await def.handler(input, ctx) };
      } catch (e) {
        // redirect(), notFound() and friends work by throwing: let them through.
        unstable_rethrow(e);
        const { payload } = translate(e, { where: def.name, requestId: ctx?.requestId, ctx });
        return { ok: false, ...payload };
      }
    };
  }

  type Schemas<P, Q, B> = {
    params?: z.ZodType<P>;
    query?: z.ZodType<Q>;
    body?: z.ZodType<B>;
  };

  async function parseInputs<P, Q, B>(
    def: Schemas<P, Q, B>,
    request: Request,
    segment: Segment | undefined,
  ) {
    const params = def.params ? def.params.parse((await segment?.params) ?? {}) : undefined;
    const query = def.query
      ? def.query.parse(fromSearchParams(new URL(request.url).searchParams))
      : undefined;
    let body: B | undefined;
    if (def.body) {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        throw new ValidationError({ _root: ["Invalid JSON body"] });
      }
      body = def.body.parse(raw);
    }
    return { params: params as P, query: query as Q, body: body as B };
  }

  function respond(result: unknown, status: number): Response {
    return result instanceof Response ? result : Response.json({ data: result }, { status });
  }

  function failure(f: Failure): Response {
    return Response.json({ error: f.payload }, { status: f.status });
  }

  function createRoute<P = undefined, Q = undefined, B = undefined, O = unknown>(
    def: Schemas<P, Q, B> & {
      name: string;
      rateLimit?: RateLimit;
      /** Success status. Default 200. */
      status?: number;
      handler: (args: {
        params: P;
        query: Q;
        body: B;
        ctx: RequestContext<A>;
        request: Request;
      }) => Promise<O | Response>;
    },
  ): (request: Request, segment?: Segment) => Promise<Response> {
    return async (request, segment) => {
      let ctx: RequestContext<A> | null = null;
      try {
        ctx = await context.require(request.headers);
        await limit(def.rateLimit, ctx.actor.userId, ctx.requestId);
        const inputs = await parseInputs(def, request, segment);
        return respond(await def.handler({ ...inputs, ctx, request }), def.status ?? 200);
      } catch (e) {
        unstable_rethrow(e);
        return failure(translate(e, { where: def.name, requestId: ctx?.requestId, ctx }));
      }
    };
  }

  /** A route with no sign-in (webhooks, health checks, public pages). Rate limited by IP. */
  function createPublicRoute<P = undefined, Q = undefined, B = undefined, O = unknown>(
    def: Schemas<P, Q, B> & {
      name: string;
      rateLimit?: RateLimit;
      status?: number;
      handler: (args: {
        params: P;
        query: Q;
        body: B;
        meta: RequestMeta;
        request: Request;
      }) => Promise<O | Response>;
    },
  ): (request: Request, segment?: Segment) => Promise<Response> {
    return async (request, segment) => {
      const meta = context.meta(request.headers);
      try {
        await limit(def.rateLimit, meta.ipAddress ?? "anon", meta.requestId);
        const inputs = await parseInputs(def, request, segment);
        return respond(await def.handler({ ...inputs, meta, request }), def.status ?? 200);
      } catch (e) {
        unstable_rethrow(e);
        return failure(translate(e, { where: def.name, requestId: meta.requestId, ctx: null }));
      }
    };
  }

  /** For pages and layouts: the signed-in context, or a redirect to the login page. */
  async function requirePage(): Promise<RequestContext<A>> {
    try {
      return await context.require(await getHeaders());
    } catch (e) {
      if (e instanceof UnauthorizedError) redirect(opts.loginPath);
      throw e;
    }
  }

  return { createAction, createRoute, createPublicRoute, requirePage };
}
