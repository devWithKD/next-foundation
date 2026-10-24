You are working in the pnpm workspace repo devWithKD/next-foundation (branch main). It contains packages/foundation (published on npm as @devwithkd/foundation 0.1.0, TypeScript source with subpath exports) and packages/eslint-plugin (@devwithkd/eslint-plugin 0.1.0, built JS). Read first: the root README.md (especially "Starting a new project"), every packages/foundation/src/*/README.md, and packages/eslint-plugin/README.md.

GOAL
Add a third package, packages/create-foundation, published later as @devwithkd/create-foundation and run with `npx @devwithkd/create-foundation`. It is run inside a brand-new create-next-app project (Next 16, App Router, TypeScript, src dir, `@/*` alias, pnpm) and sets up the layered architecture with defaults and a working example.

THE CLI MUST
1. Check it is in a Next.js app (src/app exists, next >= 16.3, Node >= 22.12) and refuse with a clear message otherwise. Detect the package manager.
2. Install: @devwithkd/foundation zod server-only drizzle-orm@1.0.0-rc.4 pg better-auth @tanstack/react-query; dev: @devwithkd/eslint-plugin drizzle-kit @types/pg tsx.
   Flags: --no-auth, --no-audit, --yes (no prompts), --dry-run, --skip-install, --force.
   Never overwrite an existing file without --force; list the skipped files.
3. Patch next.config.ts (add transpilePackages: ["@devwithkd/foundation"]) and eslint.config.mjs (add foundation.configs.recommended and settings.foundation) idempotently. If a file has an unexpected shape, print the exact manual snippet instead of guessing.
4. Write templates:
   - src/config/env.server.ts (parseEnv + zod)
   - src/server/{adapters,services,infra,logger}.ts
   - src/server/db/{client,schema}.ts (pg, drizzle({ client }), NO relations; writeDb/readDb typed with WriteExecutor/ReadExecutor from @devwithkd/foundation/db)
   - drizzle.config.ts
   - src/lib/permissions/{statements,roles,index}.ts (createAuthz)
   - with auth: src/server/auth/{config.server,actor,context}.ts (better-auth + admin plugin, toActor via permissionsFromRoles, defineAuthContext) and app/api/auth/[...all]/route.ts
   - with audit: src/modules/audit/{audit.sql,audit.repository}.ts using the canonical table in packages/foundation/src/audit/README.md
   - src/app/providers.tsx mounted in the root layout
   - .env.example
   - package.json scripts (db:generate, db:migrate, test)
5. Write an example module `note` (src/modules/note/: sql, contract with defineListQuery, keys, repository, queries, policy, service, audit actions), plus src/app/notes/{page.tsx,_actions.ts,_components/*} and src/app/api/v1/notes/route.ts. The page prefetches the first list page and hands it to a client table (RSC prefetch -> TanStack, identical query keys). Include vitest unit tests for policy and contract, and an integration test that is skipped without TEST_DATABASE_URL. Generate the initial drizzle migration.
6. Print concise next steps (set env, create DB, migrate, pnpm dev, open /notes).

IMPLEMENTATION
- TypeScript compiled to dist/ with a bin entry; copy the build setup of packages/eslint-plugin.
- Minimal dependencies (node built-ins; @clack/prompts is fine).
- Templates are real files under packages/create-foundation/templates/ copied with simple {{var}} substitution, and listed in the package `files`.
- package.json metadata like the other two packages: MIT, author "Kedar Joshi", repository with directory, publishConfig.access public, engines node >= 22.12, prepublishOnly = build + typecheck + test. Copy LICENSE, write a README, add a CHANGELOG entry under Unreleased.
- Versions: zod ^4, Next 16.3+, React 19.2, drizzle-orm 1.0.0-rc.4 (`PgAsyncDatabase`), better-auth ^1.7.
- This Next version has breaking changes. If a Next API looks unfamiliar, read node_modules/next/dist/docs/ in the generated app.
- Do not copy anything worcoor-specific (org-unit scope, role templates, Sentry, Discord, Expo/mobile routes). Everything must derive from this repo's READMEs and source.

VERIFICATION (required; report honestly what you could and could not run)
a) pnpm -r build, typecheck and test pass in the workspace.
b) Unit-test the file writer, the idempotent patching and --dry-run.
c) End to end, in a temp dir: `pnpm create next-app@latest e2e --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes`. Pack the CLI with npm pack, install the tarball, and run it with --yes. In the generated app, tsc --noEmit, pnpm lint, and `next build` (BETTER_AUTH_URL=https://example.com plus dummy env values) must all pass with zero errors. A second CLI run must change nothing.
d) If Postgres is available, start a throwaway DB whose name ends in _test, run the migration and the integration test. If not, say so.
e) Break one generated test on purpose to confirm it notices.

CONSTRAINTS
- Work on a new branch `create-foundation`, in small logical commits, and push it.
- Do NOT push to main, do NOT tag, and do NOT run npm login or npm publish (publishing needs the owner's authenticator code).
- Do not edit packages/foundation or packages/eslint-plugin except for real bugs you find. List each one in the final report with the failing case.

FINAL REPORT
Branch, commit list, exact verification commands and results, what could not be verified, known limitations, and the steps for the owner to publish (version bump and OTP).
