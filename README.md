# next-foundation

Shared architecture for Next.js projects: one package (`@devwithkd/foundation`,
TypeScript source with subpath exports) and one ESLint plugin
(`@devwithkd/eslint-plugin`, built JS).

The design decisions and the build plans live in the `worcoor-web-v2.0` repo
under `docs/plans/` (start with `00-overview.md`).

## What is in the package

Every subpath has its own README in `packages/foundation/src/<name>/`.

| Subpath | For |
|---|---|
| `errors`, `result`, `env`, `logger` | typed failures, wire types, validated env, the logger interface |
| `authz`, `better-auth`, `context` | permission checks, role expansion, request context (auth is a slot) |
| `adapters` | `createAction` / `createRoute` / `createPublicRoute` / `requirePage` |
| `list`, `query`, `react` | one list schema for RSC, route and client; query keys; client hooks |
| `db` | Drizzle repository base, helpers, option lookups |
| `redis`, `redis/ioredis`, `redis/upstash`, `cache`, `jobs` | Redis client + rate limit + lock, cache port, job port |
| `audit` | audit actions, entries, redaction, diffing |

## Starting a new project

This is the order that works. Each step compiles on its own, so you can stop
after any of them. A complete reference app (auth, roles, audit, tests) exists
as `worcoor-web-v2.0`; copy from it when a snippet below is too short.

### 1. Create the app and install

```sh
pnpm create next-app@latest my-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd my-app

pnpm add @devwithkd/foundation zod server-only drizzle-orm@1.0.0-rc.4 pg \
         better-auth @tanstack/react-query
pnpm add -D @devwithkd/eslint-plugin drizzle-kit @types/pg
# Optional: ioredis (or @upstash/redis) for rate limiting and caching
```

`drizzle-orm` must be `>=1.0.0-rc.4` (the package uses `PgAsyncDatabase`). Use
`@neondatabase/serverless` instead of `pg` on Neon. Node `>=22.12`.

### 2. Configure Next and ESLint

```ts
// next.config.ts: the package ships TypeScript source
const nextConfig: NextConfig = { transpilePackages: ["@devwithkd/foundation"] };
```

```js
// eslint.config.mjs
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import foundation from "@devwithkd/eslint-plugin";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...foundation.configs.recommended,
  { settings: { foundation: { srcDir: "src", appDir: "src/app", modulesDir: "src/modules", serverDir: "src/server", alias: { "@/": "src/" } } } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

### 3. Lay out the folders

```
src/
  app/                       routes only: pages, layouts, _actions.ts, route.ts, _components/
  modules/<name>/            one folder per business area, files named <name>.<kind>.ts
  server/                    wiring: adapters.ts, services.ts, infra.ts, db/, auth/, logger/
  config/                    env.server.ts, env.client.ts
  lib/                       permissions (statements, roles), small helpers
```

A module has these files (create only the ones it needs). The lint plugin
enforces who may import what:

| File | Holds |
|---|---|
| `<name>.sql.ts` | Drizzle table |
| `<name>.contract.ts` | zod input/output schemas and list query (shared by action, route and client) |
| `<name>.keys.ts` | `createQueryKeys("<name>")` |
| `<name>.repository.ts` | write path (`Repository` / `SoftDeletableRepository`) |
| `<name>.queries.ts` | read path for lists and lookups |
| `<name>.policy.ts` | permission and business-rule checks |
| `<name>.service.ts` | the use cases: policy, repository, audit in one transaction |
| `<name>.domain.ts` / `.mapper.ts` / `.audit.ts` | pure rules, row-to-DTO mapping, `defineAuditActions` |

Other modules may import only `service`, `contract` and `keys`.

### 4. Wire the foundation (the `src/server` files)

1. **Env.** `config/env.server.ts`: a zod schema through `parseEnv` (see `env`).
2. **Database.** `server/db/client.ts` builds `drizzle({ client })` and exports
   `writeDb` and `readDb`. Type them with `WriteExecutor` / `ReadExecutor` from
   `@devwithkd/foundation/db`. Do not use drizzle `relations`.
3. **Auth** (your choice; better-auth is the supported helper). Create the
   better-auth instance in `server/auth/config.server.ts` with the admin plugin
   if you want roles. Then:
   - define permissions once in `lib/permissions/statements.ts` with `createAuthz`
     (`can`, `assertCan`, `capabilities`) and your roles;
   - write `toActor(session)` returning `{ userId, label, role, permissions, ...yours }`
     using `permissionsFromRoles` (return `null` for a deleted user);
   - export `authContext = defineAuthContext({ getSession, toActor, ipHeaders, trustProxy, logger })`.
4. **Logger.** `server/logger`: any implementation of the `Logger` interface (pino, Sentry, Discord).
5. **Adapters.** `server/adapters.ts`:
   ```ts
   export const { createAction, createRoute, createPublicRoute, requirePage } =
     createAdapters<Actor>({ context: authContext, logger, loginPath: "/login", rateLimiter });
   ```
   `rateLimiter` is optional; build it from a Redis client in `server/infra.ts`
   with `createRedisRateLimiter`. Without Redis, leave it `undefined`.
6. **Services.** `server/services.ts` is the composition root: it builds each
   repository and service once. It is the only `server/` file allowed to import `modules/`.
7. **Audit** (recommended). Copy the canonical `audit_log` table from the `audit`
   README into `modules/audit/audit.sql.ts`, add an `AuditRepository.record(entry, tx?)`,
   and pass it to your services.
8. **Providers.** A client `providers.tsx` with `QueryClientProvider` and
   `getQueryClient()` from `@devwithkd/foundation/query`, mounted in the root layout.

### 5. Build the first feature

Use this order for every feature; the types flow downward.

1. `<name>.sql.ts`, then `drizzle-kit generate` and `migrate`.
2. `<name>.contract.ts`: zod inputs and `defineListQuery({ filters, sortable, defaultSort, pageSize })`.
3. `<name>.repository.ts`, `<name>.queries.ts`, `<name>.policy.ts`, `<name>.service.ts`.
   Services take `(ctx, input)`, call `assertCan`, and write audit rows on the same transaction.
4. Register the service in `server/services.ts`.
5. Expose it. One service, any number of doors:
   ```ts
   // app/things/_actions.ts  ("use server": exports must all be createAction results)
   export const createThing = createAction({
     name: "thing.create", input: createThingInput, rateLimit: { key: "thing:write", perMinute: 30 },
     handler: (input, ctx) => thingService.create(ctx, input),
   });

   // app/api/v1/things/route.ts  (only if a mobile app or other client needs HTTP)
   export const GET = createRoute({ name: "thing.list", query: thingListQuery,
     handler: ({ query, ctx }) => thingService.list(ctx, query) });
   ```
6. The page prefetches the first list page and hands it to the client table:
   ```tsx
   const ctx = await requirePage();
   const params = thingListQuery.parse({});
   const qc = getQueryClient();
   await qc.prefetchQuery({ queryKey: thingKeys.list(params), queryFn: () => thingService.list(ctx, params) });
   return <HydrationBoundary state={dehydrate(qc)}><ThingsTable /></HydrationBoundary>;
   ```
   The client uses `useListState(thingListQuery)` and the same `thingKeys.list(params)`,
   so the first render needs no request. Mutations use `useActionMutation(createThing, { invalidate: [thingKeys.lists] })`.

### 6. Rules the lint plugin will enforce on you

- Server actions live in `_actions.ts` beside the page that uses them. No `*.actions.ts` files.
- Every export of an `_actions.ts` file is a `createAction(...)`. Nothing else.
- Pages never import repositories, `*.sql` or the db client; they call services.
- Check **permissions**, never `actor.role`.
- Throw `AppError` subclasses (`NotFoundError`, `ConflictError`, ...) from services; the adapters turn them into responses.

### 7. Tests

Unit-test policies, domain, mappers and contracts with no database. Test
repositories and services against a throwaway Postgres whose name must end in
`_test` (the reference app's harness refuses anything else because it drops the
schema).

## Reference: using it in a project

Peer dependencies: `next >=16.3`, `react >=19.2`, `zod >=4.1`, `drizzle-orm >=1.0.0-rc.4`,
and, only for the subpaths you import, `@tanstack/react-query`, `better-auth`,
`ioredis` / `@upstash/redis`, `server-only`. Node `>=22.12`.

The package ships TypeScript source, so add it to `next.config.ts`:

```ts
const nextConfig = { transpilePackages: ["@devwithkd/foundation"] };
```

### Install

```sh
pnpm add @devwithkd/foundation
pnpm add -D @devwithkd/eslint-plugin
```

### Developing the package against an app

Install from the sibling checkout. pnpm's `injected` makes a real copy (so peer
dependencies resolve from the app) instead of a symlink:

```jsonc
// the app's package.json (temporarily, while changing the package)
"dependencies": { "@devwithkd/foundation": "file:../next-foundation/packages/foundation" },
"dependenciesMeta": { "@devwithkd/foundation": { "injected": true } }
```

After changing the package run `pnpm install` in the app. Build the ESLint
plugin first (`pnpm build` here): its `dist/` is not committed. Switch back to
the registry version before committing the app.

### Releasing

Both packages are public on npm under the `@devwithkd` scope.

```sh
npm login                                   # once per machine
pnpm -r publish --access public --dry-run   # check what would go out
pnpm -r publish --access public             # `prepublishOnly` typechecks, tests and builds
```

Bump the version in each `package.json` first (published versions cannot be
changed) and add a line to `CHANGELOG.md`.

## Working on the package

```sh
pnpm install
pnpm build       # eslint-plugin -> dist/
pnpm typecheck
pnpm test
```

Tests are vitest. The react tests use jsdom, selected per file, so the rest run
on node. When you add behaviour, break it on purpose once to confirm a test
notices.
