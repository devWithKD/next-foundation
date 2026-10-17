# Changelog

## Unreleased

- Docs: README now has a step-by-step guide for starting a new project.

## 0.1.0

First version. Published to npm (public) as `@devwithkd/foundation` and `@devwithkd/eslint-plugin`.

- `adapters`: `createAction` returns `(raw: z.input<schema>) => …` (not `unknown`), so `useActionMutation` callers type-check what they submit. At runtime it still accepts anything and validates it.
- `db`: `containsLike` / `escapeLike`: case-insensitive "contains" that treats `%`, `_` and `\` in user text as ordinary characters; `makeOptionQuery` uses it.

### `@devwithkd/foundation`
- `errors`, `result`, `env`, `logger`: shared failure types, wire types, validated env, logger interface.
- `authz`, `better-auth`, `context`: permission helpers, role-string expansion, request context.
- `adapters`: `createAction`, `createRoute`, `createPublicRoute`, `requirePage` (identity, rate limit, parse, handler; error translation; denied-attempt hook).
- `list`, `query`, `react`: one list schema for server and client, query keys and client, `fetchApi`, `ApiError`, `useListState`, `useActionMutation`, `applyFieldErrors`.
- `db`: `Repository` / `SoftDeletableRepository` (options-object API, opt-in row locks, scope on updates, `deletedAt` soft delete), helpers, `makeOptionQuery`. Targets `PgAsyncDatabase`, no relations.
- `redis` (+ `redis/ioredis`, `redis/upstash`), `cache`, `jobs`: factories only, no `process.env`.
- `audit`: `defineAuditActions` (severity per action), `auditEntry`, `redact`, `diff`.

### `@devwithkd/eslint-plugin`
- Rules: `colocated-actions`, `no-foreign-actions`, `server-actions-only-wrapped`, `module-boundaries`.
- Presets: `recommended`, `standalone`.
