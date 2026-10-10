import "server-only";
import type { BaseActor } from "../authz";
import { UnauthorizedError } from "../errors";
import type { Logger } from "../logger";

export type RequestMeta = {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type RequestContext<A extends BaseActor> = RequestMeta & { actor: A };

export type AuthContext<A extends BaseActor> = {
  /** requestId, IP and user agent from the headers. No session needed. */
  meta(headers: Headers): RequestMeta;
  /** The signed-in context, or throws UnauthorizedError. Each adapter decides what that means. */
  require(headers: Headers): Promise<RequestContext<A>>;
  /** The signed-in context, or null. */
  optional(headers: Headers): Promise<RequestContext<A> | null>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Wires a project's auth into the shared adapters. The package never imports
 * better-auth's instance: the project says how to get a session and how to turn
 * it into its own Actor.
 */
export function defineAuthContext<S, A extends BaseActor>(opts: {
  getSession: (headers: Headers) => Promise<S | null>;
  /** Return null to treat a valid session as signed out (e.g. a soft-deleted user). */
  toActor: (session: S, meta: RequestMeta) => Promise<A | null>;
  /** Pass the SAME list to better-auth's advanced.ipAddress.ipAddressHeaders. */
  ipHeaders: readonly string[];
  /**
   * Only true behind a proxy that overwrites these headers (Vercel, a load
   * balancer). Otherwise the client chooses the value, so we record null.
   */
  trustProxy: boolean;
  logger: Logger;
}): AuthContext<A> {
  function clientIp(headers: Headers): string | null {
    if (!opts.trustProxy) return null;
    for (const name of opts.ipHeaders) {
      const first = headers.get(name)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return null;
  }

  function meta(headers: Headers): RequestMeta {
    const incoming = headers.get("x-request-id");
    let requestId: string;
    if (incoming && UUID.test(incoming)) {
      requestId = incoming;
    } else {
      // proxy.ts should set this on every request. A missing one is an
      // observability bug, not a reason to fail the user's request.
      requestId = crypto.randomUUID();
      opts.logger.warn({}, "missing_request_id");
    }
    return {
      requestId,
      ipAddress: clientIp(headers),
      userAgent: headers.get("user-agent"),
    };
  }

  async function optional(headers: Headers): Promise<RequestContext<A> | null> {
    const m = meta(headers);
    const session = await opts.getSession(headers);
    if (!session) return null;
    const actor = await opts.toActor(session, m);
    return actor ? { ...m, actor } : null;
  }

  async function require(headers: Headers): Promise<RequestContext<A>> {
    const ctx = await optional(headers);
    if (!ctx) throw new UnauthorizedError();
    return ctx;
  }

  return { meta, require, optional };
}
