import tseslint from "typescript-eslint";
import type { ESLint, Linter } from "eslint";
import colocatedActions from "./rules/colocated-actions.js";
import moduleBoundaries from "./rules/module-boundaries.js";
import noForeignActions from "./rules/no-foreign-actions.js";
import serverActionsOnlyWrapped from "./rules/server-actions-only-wrapped.js";

export { DEFAULT_SETTINGS, type FoundationSettings } from "./settings.js";
export { DEFAULT_ALLOW } from "./rules/module-boundaries.js";

export const rules = {
  "colocated-actions": colocatedActions,
  "no-foreign-actions": noForeignActions,
  "server-actions-only-wrapped": serverActionsOnlyWrapped,
  "module-boundaries": moduleBoundaries,
};

const plugin: ESLint.Plugin = { meta: { name: "@devwithkd/eslint-plugin", version: "0.1.0" }, rules };

// Flat config does NOT merge `no-restricted-imports` across blocks: for a given
// file the LAST matching block's options replace the earlier ones. Keep the
// `files` globs below disjoint, or a later block silently disables an earlier one.
const restrict = (files: string[], options: Record<string, unknown>): Linter.Config => ({
  files,
  rules: { "no-restricted-imports": ["error", options] },
});
const pattern = (group: string[], message: string) => ({ group, message, allowTypeImports: true });

/**
 * The rules, plus the import restrictions. It ENABLES
 * `@typescript-eslint/consistent-type-imports` but does not register that
 * plugin: `eslint-config-next/typescript` (and typescript-eslint's own
 * presets) already do, and flat config refuses a second registration under
 * the same name ("Cannot redefine plugin"). If your config has no
 * `@typescript-eslint` plugin, use `configs.standalone` instead.
 */
export const recommended: Linter.Config[] = [
  {
    name: "@devwithkd/rules",
    plugins: { "@devwithkd": plugin },
    rules: {
      "@devwithkd/colocated-actions": "error",
      "@devwithkd/no-foreign-actions": "error",
      "@devwithkd/server-actions-only-wrapped": "error",
      "@devwithkd/module-boundaries": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  restrict(["**/*.domain.ts"], {
    patterns: [
      pattern(["@/server/**", "next/**"], "Domain code is pure: no server infrastructure, no Next."),
      pattern(["**/*.repository", "**/*.service", "**/*.queries"], "Domain code is pure: it can't depend on the layers that call it."),
    ],
  }),
  restrict(["**/*.mapper.ts"], {
    patterns: [
      pattern(["@/server/**"], "Mappers are pure: no server infrastructure."),
      pattern(["**/*.repository", "**/*.service"], "Mappers can't depend on the layers that call them."),
    ],
  }),
  restrict(["**/*.repository.ts"], {
    patterns: [
      pattern(["zod", "next/**"], "Repositories speak SQL and rows only: parsing and framework code live in services."),
      pattern(["@/server/cache*"], "Repositories don't cache: the service decides."),
      pattern(["**/*.service"], "Repositories can't depend on services."),
    ],
  }),
  restrict(["**/*.queries.ts"], {
    patterns: [pattern(["**/*.repository"], "Read models don't go through repositories.")],
    paths: [{ name: "@/server/db/client", importNames: ["writeDb"], message: "Queries read; use readDb.", allowTypeImports: true }],
  }),
  restrict(["src/app/**"], {
    patterns: [
      pattern(["**/*.repository", "**/*.sql"], "Pages and routes go through services and queries, never straight to the data layer."),
      pattern(["@/server/db/client"], "Pages and routes don't touch the database client."),
    ],
  }),
];

/** `recommended` for projects that don't already register the `@typescript-eslint` plugin. */
export const standalone: Linter.Config[] = [
  { name: "@devwithkd/typescript-plugin", plugins: { "@typescript-eslint": tseslint.plugin as unknown as ESLint.Plugin } },
  ...recommended,
];

export const configs: { recommended: Linter.Config[]; standalone: Linter.Config[] } = { recommended, standalone };

const exported: ESLint.Plugin & { configs: typeof configs } = { ...plugin, configs };
export default exported;
