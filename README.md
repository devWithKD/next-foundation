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

## Using it in a project

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
