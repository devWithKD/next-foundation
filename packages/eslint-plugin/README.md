# @kedar/eslint-plugin

Lint rules that keep the layered pattern from eroding. Built JS (`dist/`), so
build it before linting: `pnpm --filter @kedar/eslint-plugin build`.

```js
// eslint.config.mjs
import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import kedar from "@kedar/eslint-plugin";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...kedar.configs.recommended, // or .standalone if nothing registers @typescript-eslint
  // Optional: only if your layout differs from the defaults below.
  { settings: { kedar: { srcDir: "src", appDir: "src/app", modulesDir: "src/modules", serverDir: "src/server", alias: { "@/": "src/" } } } },
]);
```

## Rules (all `error` in `recommended`)

| Rule | What it enforces |
|---|---|
| `colocated-actions` | A `"use server"` file is `_actions.ts` (or directly inside `_actions/`) under `appDir`, in a folder that has a `page` or `layout`. No `*.action(s).ts` files anywhere. No inline `"use server"` in a function body. |
| `no-foreign-actions` | Only files inside a route folder may import that folder's `_actions` (type-only imports excepted). |
| `server-actions-only-wrapped` | Every export of a `"use server"` file is `export const x = createAction(...)` (option `callees`) or a type. Every export is a public endpoint. |
| `module-boundaries` | Module files are `<name>.<suffix>.ts`. Across modules only `service`, `contract`, `keys` may be imported (`sql`→`sql`, `queries`→`sql`/`contract`/`keys`, `repository`→`sql`; options `allow`). Files in `serverDir` may not import modules at runtime except the composition root (option `serverAllow`). Type-only imports and test files are exempt. |

`recommended` also enables `@typescript-eslint/consistent-type-imports` and
`no-restricted-imports` blocks per file kind (`*.domain.ts` pure, `*.mapper.ts`,
`*.repository.ts` no zod/Next/cache, `*.queries.ts` reads only, `src/app/**`
never touches repositories, `*.sql` or the db client).

## Good to know

- `recommended` does **not** register the `@typescript-eslint` plugin: `eslint-config-next/typescript` already does and flat config rejects a second registration. Use `configs.standalone` when nothing else registers it.
- Flat config does not merge `no-restricted-imports` across blocks: the last matching block wins. The preset's globs are disjoint on purpose; keep yours disjoint too, or merge them into one block.
- The restricted-import globs match the specifier text, so a deep relative import (`../../server/db/client`) slips past them. `module-boundaries` does resolve relative paths.
- Project-specific rules (for example "only `applyEffects` writes ledger tables") belong in the project, not here.
