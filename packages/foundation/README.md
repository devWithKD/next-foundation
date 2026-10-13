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

## Subpaths

`errors`, `result`, `env`, `logger`, `authz`, `better-auth`, `context`,
`adapters`, `list`, `query`, `react`, `db`, `redis` (+ `redis/ioredis`,
`redis/upstash`), `cache`, `jobs`, `audit`. Each has a README in its folder
(`src/<name>/README.md`) with usage and the rules behind it.

Lint rules that keep the layering from eroding live in
[`@devwithkd/eslint-plugin`](https://www.npmjs.com/package/@devwithkd/eslint-plugin).

License: MIT
