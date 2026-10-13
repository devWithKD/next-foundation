# Changelog

## Unreleased

- `adapters`: `createAction` now returns `(raw: z.input<schema>) => …` instead of `(raw: unknown) => …`, so clients (`useActionMutation`) type-check the values they submit. At runtime it still accepts anything and validates it.
- `db`: `containsLike` / `escapeLike`: case-insensitive "contains" that treats `%`, `_` and `\` in user text as ordinary characters. `makeOptionQuery` now uses it (searching for `100%` used to act as a wildcard).

## 0.1.0

First version. Not published; consumed from a sibling checkout.

### `@kedar/foundation`
- `errors`, `result`, `env`, `logger`: shared failure types, wire types, validated env, logger interface.
- `authz`, `better-auth`, `context`: permission helpers, role-string expansion, request context.
- `adapters`: `createAction`, `createRoute`, `createPublicRoute`, `requirePage` (identity, rate limit, parse, handler; error translation; denied-attempt hook).
- `list`, `query`, `react`: one list schema for server and client, query keys and client, `fetchApi`, `ApiError`, `useListState`, `useActionMutation`, `applyFieldErrors`.
- `db`: `Repository` / `SoftDeletableRepository` (options-object API, opt-in row locks, scope on updates, `deletedAt` soft delete), helpers, `makeOptionQuery`. Targets `PgAsyncDatabase`, no relations.
- `redis` (+ `redis/ioredis`, `redis/upstash`), `cache`, `jobs`: factories only, no `process.env`.
- `audit`: `defineAuditActions` (severity per action), `auditEntry`, `redact`, `diff`.

### `@kedar/eslint-plugin`
- Rules: `colocated-actions`, `no-foreign-actions`, `server-actions-only-wrapped`, `module-boundaries`.
- Presets: `recommended`, `standalone`.
