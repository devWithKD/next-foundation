# @devwithkd/foundation

Building blocks for layered Next.js apps (App Router, server actions and route
handlers over the same services): adapters, authorization, list and query
contracts, Drizzle repositories, audit, Redis, and React hooks.

**It ships TypeScript source** with subpath exports. Add it to
`next.config.ts` so Next compiles it:

```ts
const nextConfig = { transpilePackages: ["@devwithkd/foundation"] };
```

```sh
pnpm add @devwithkd/foundation
```

Node `>=22.12`. Peer dependencies: `next >=16.3`, `react >=19.2`, `zod >=4.1`,
`drizzle-orm >=1.0.0-rc.4`; and, only for the subpaths you import,
`@tanstack/react-query`, `better-auth`, `ioredis` or `@upstash/redis`, `server-only`.

## Quick start

```sh
pnpm create next-app@latest my-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
cd my-app
pnpm add @devwithkd/foundation zod server-only drizzle-orm@1.0.0-rc.4 pg better-auth @tanstack/react-query
pnpm add -D @devwithkd/eslint-plugin drizzle-kit @types/pg
```

Then add `transpilePackages: ["@devwithkd/foundation"]` to `next.config.ts`,
register the ESLint preset, and wire `src/server/adapters.ts`:

```ts
import { createAdapters } from "@devwithkd/foundation/adapters";

export const { createAction, createRoute, createPublicRoute, requirePage } =
  createAdapters<Actor>({ context: authContext, logger, loginPath: "/login" });
```

Every server action, route handler and page then goes through those four
functions over the same services. The full step-by-step guide (folder layout,
module file kinds, auth, audit, first feature, lint rules) is in the
[repository README](https://github.com/devWithKD/next-foundation#starting-a-new-project).

## Subpaths

`errors`, `result`, `env`, `logger`, `authz`, `better-auth`, `context`,
`adapters`, `list`, `query`, `react`, `db`, `redis` (+ `redis/ioredis`,
`redis/upstash`), `cache`, `jobs`, `audit`. Each has a README in its folder
(`src/<name>/README.md`) with usage and the rules behind it.

Lint rules that keep the layering from eroding live in
[`@devwithkd/eslint-plugin`](https://www.npmjs.com/package/@devwithkd/eslint-plugin).

License: MIT
