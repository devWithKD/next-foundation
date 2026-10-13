# adapters

The two ways in: server actions and route handlers. Both run the same pipeline
over the same services, so a project can serve a web UI and a mobile app from
one set of commands.

```ts
import { createAdapters } from "@kedar/foundation/adapters";

export const { createAction, createRoute, createPublicRoute, requirePage } = createAdapters({
  context: authContext,
  logger,
  loginPath: "/login",
  rateLimiter,                                   // optional: createRedisRateLimiter(...)
  onDenied: (ctx, info) => audit(ctx, info),     // optional: record authz.denied
});

// app/roles/_actions.ts
"use server";
export const createRole = createAction({
  name: "role.create",
  input: createRoleSchema,
  rateLimit: { key: "role.create", perMinute: 30 },
  handler: async (input, ctx) => roleService.create(ctx, input),
});

// app/api/v1/roles/route.ts
export const GET = createRoute({
  name: "role.list",
  query: roleListQuery,
  handler: async ({ query, ctx }) => roleQueries.list(ctx, query),
});
```

Order, always: **identity → rate limit → parse → handler.** Parsing untrusted
input before throttling lets garbage make you do work.

- Actions return `ActionResult` (errors as data, never thrown). Routes return `{ data }` or `{ error }` with the right status; a handler may return a `Response` for full control.
- `AppError`s are translated to their code/status; anything else is logged and reported, and the user gets a generic message plus a short `ref`.
- Next's own control-flow throws (`redirect`, `notFound`, dynamic-usage errors) are re-thrown with `unstable_rethrow`, never swallowed.
- `ForbiddenError`s call `onDenied` inside `after()`, so a denial is recorded without delaying the response.
- `requirePage()` is for pages and layouts: the context, or a redirect to `loginPath`.
- `createPublicRoute` has no sign-in (webhooks, health) and rate-limits by IP.
- Server-action files may export **only** `createAction(...)` results (the `server-actions-only-wrapped` lint rule): every export of a `"use server"` file is a public endpoint.
