# next-foundation

Shared architecture for Next.js projects: one package (`@kedar/foundation`,
TypeScript source with subpath exports) and one ESLint plugin
(`@kedar/eslint-plugin`, built JS).

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

## Using it in a project

Peer dependencies: `next >=16.3`, `react >=19.2`, `zod >=4.1`, `drizzle-orm >=1.0.0-rc.4`,
and, only for the subpaths you import, `@tanstack/react-query`, `better-auth`,
`ioredis` / `@upstash/redis`, `server-only`. Node `>=22.12`.

The package ships TypeScript source, so add it to `next.config.ts`:

```ts
const nextConfig = { transpilePackages: ["@kedar/foundation"] };
```

### Development (what worcoor-web-v2.0 uses)

Install from the sibling checkout. pnpm's `injected` makes a real copy (so peer
dependencies resolve from the consumer) instead of a symlink:

```jsonc
// consumer package.json
"dependencies": {
  "@kedar/foundation": "file:../next-foundation/packages/foundation",
  "@kedar/eslint-plugin": "file:../next-foundation/packages/eslint-plugin"
},
"dependenciesMeta": {
  "@kedar/foundation": { "injected": true },
  "@kedar/eslint-plugin": { "injected": true }
}
```

After changing the package, run `pnpm install` in the consumer to re-sync the
injected copy. **Build the ESLint plugin first** (`pnpm build` here): its
`dist/` is not committed.

### Published (later)

GitHub Packages, with `@kedar:registry=https://npm.pkg.github.com` in the
consumer's `.npmrc`. The npm scope must equal the GitHub owner, so rename
`@kedar` to the real owner before the first publish (`@kedar` is a placeholder).

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
