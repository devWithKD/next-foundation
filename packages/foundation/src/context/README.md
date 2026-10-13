# context

Turns request headers into a `RequestContext`: request id, IP, user agent and
the signed-in actor. The package never imports your auth instance.

```ts
import { defineAuthContext } from "@kedar/foundation/context";

export const authContext = defineAuthContext({
  getSession: (h) => auth.api.getSession({ headers: h }),
  toActor,                                  // (session, meta) => Actor | null
  ipHeaders: IP_HEADERS,                    // the SAME list you give better-auth
  trustProxy: serverEnv.TRUST_PROXY,
  logger,
});
// authContext.require(headers) → RequestContext, or throws UnauthorizedError
// authContext.optional(headers) → RequestContext | null
// authContext.meta(headers)     → { requestId, ipAddress, userAgent } (no session needed)
```

- `toActor` may return `null` to treat a valid session as signed out (a soft-deleted user, say).
- **`trustProxy` must be false unless a proxy you control overwrites the IP headers** (Vercel, a load balancer). Otherwise the client chooses its own IP and the audit log is fiction; with `false` the IP is recorded as `null`.
- An incoming `x-request-id` is reused only when it is a valid UUID; otherwise one is generated.
- `RequestContext` is structurally an `AuditContext`, so `auditEntry(ctx, …)` fills IP, user agent and request id for free.
