import path from "node:path";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import plugin, { configs, recommended, standalone } from "../src/index.js";

// The preset's globs are relative to the project root, so lint a fixture project.
const cwd = path.join(process.cwd(), "test/fixtures/project");

const parser = { files: ["**/*.ts", "**/*.tsx"], languageOptions: { parser: tseslint.parser as Linter.Parser } };

function eslint(preset: Linter.Config[] = standalone) {
  return new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [parser, ...preset] });
}

async function lint(filePath: string, code: string) {
  const [result] = await eslint().lintText(code, { filePath: path.join(cwd, filePath) });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message.split("\n")[0]}`);
}

const hits = (messages: string[], ruleId: string) => messages.filter((m) => m.startsWith(`${ruleId}:`));

describe("recommended preset", () => {
  it("exports the presets on the plugin and four rules", () => {
    expect(plugin.configs.recommended).toBe(recommended);
    expect(configs.recommended).toBe(recommended);
    expect(configs.standalone).toBe(standalone);
    expect(Object.keys(plugin.rules ?? {}).sort()).toEqual(["colocated-actions", "module-boundaries", "no-foreign-actions", "server-actions-only-wrapped"]);
  });

  it("wires the custom rules with the default layout", async () => {
    const messages = await lint("src/app/orders/_actions.ts", '"use server";\nexport async function create() {}\n');
    expect(hits(messages, "@devwithkd/server-actions-only-wrapped")).toHaveLength(1);

    expect(await lint("src/app/orders/_actions.ts", '"use server";\nimport { createAction } from "@/server/adapters";\nexport const create = createAction({});\n')).toEqual([]);

    const legacy = await lint("src/modules/user/user.actions.ts", "export const x = 1;\n");
    expect(hits(legacy, "@devwithkd/colocated-actions")).toHaveLength(1);

    const foreign = await lint("src/modules/user/user.service.ts", 'import { r } from "@/modules/role/role.repository";\nexport const x = r;\n');
    expect(hits(foreign, "@devwithkd/module-boundaries")).toHaveLength(1);
  });

  it("`recommended` works next to a config that registers @typescript-eslint (eslint-config-next does)", async () => {
    // Same plugin object under the same name merges fine; a second, different
    // registration is what ESLint rejects, which is why `recommended` has none.
    const withHost = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [parser, { plugins: { "@typescript-eslint": tseslint.plugin as unknown as ESLint.Plugin } }, ...recommended],
    });
    const [r] = await withHost.lintText('import { Role } from "./role";\nexport const x: Role | null = null;\n', { filePath: path.join(cwd, "src/modules/user/user.service.ts") });
    expect(r?.messages.map((m) => m.ruleId)).toEqual(["@typescript-eslint/consistent-type-imports"]);
  });

  it("`recommended` alone fails loudly when the TypeScript plugin is missing", async () => {
    await expect(eslint(recommended).lintText("export {};", { filePath: path.join(cwd, "src/a.ts") })).rejects.toThrow(/@typescript-eslint/);
  });

  it("requires type-only imports to be written as such", async () => {
    const messages = await lint("src/modules/user/user.service.ts", 'import { Role } from "./role";\nexport const x: Role | null = null;\n');
    expect(hits(messages, "@typescript-eslint/consistent-type-imports")).toHaveLength(1);
  });

  it("keeps pages and routes away from the data layer", async () => {
    expect(hits(await lint("src/app/orders/page.tsx", 'import { UserRepository } from "@/modules/user/user.repository";\nexport const x = UserRepository;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/app/orders/page.tsx", 'import { user } from "@/modules/user/user.sql";\nexport const x = user;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/app/orders/page.tsx", 'import { readDb } from "@/server/db/client";\nexport const x = readDb;\n'), "no-restricted-imports")).toHaveLength(1);
    // Types are fine.
    expect(hits(await lint("src/app/orders/page.tsx", 'import type { UserRepository } from "@/modules/user/user.repository";\nexport type X = UserRepository;\n'), "no-restricted-imports")).toEqual([]);
  });

  it("keeps domain code pure", async () => {
    expect(hits(await lint("src/modules/user/user.domain.ts", 'import { after } from "next/server";\nexport const x = after;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.domain.ts", 'import { logger } from "@/server/logger";\nexport const x = logger;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.domain.ts", 'import { UserRepository } from "./user.repository";\nexport const x = UserRepository;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.domain.ts", 'import { z } from "zod";\nexport const x = z;\n'), "no-restricted-imports")).toEqual([]);
  });

  it("keeps mappers, repositories and queries in their lane", async () => {
    expect(hits(await lint("src/modules/user/user.mapper.ts", 'import { UserService } from "./user.service";\nexport const x = UserService;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.repository.ts", 'import { z } from "zod";\nexport const x = z;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.repository.ts", 'import { cache } from "@/server/cache";\nexport const x = cache;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.queries.ts", 'import { UserRepository } from "./user.repository";\nexport const x = UserRepository;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.queries.ts", 'import { writeDb } from "@/server/db/client";\nexport const x = writeDb;\n'), "no-restricted-imports")).toHaveLength(1);
    expect(hits(await lint("src/modules/user/user.queries.ts", 'import { readDb } from "@/server/db/client";\nexport const x = readDb;\n'), "no-restricted-imports")).toEqual([]);
  });

  it("restricts each file with exactly one block (flat config does not merge no-restricted-imports)", async () => {
    // If two blocks matched, the later one would silently replace the earlier.
    const cases: [string, number][] = [
      ["src/modules/user/user.domain.ts", 2],
      ["src/modules/user/user.mapper.ts", 2],
      ["src/modules/user/user.repository.ts", 3],
      ["src/app/orders/page.tsx", 2],
    ];
    for (const [file, patterns] of cases) {
      const config = (await eslint().calculateConfigForFile(path.join(cwd, file))) as Linter.Config;
      const options = (config.rules?.["no-restricted-imports"] as [string, { patterns: unknown[] }])[1];
      expect(options.patterns, file).toHaveLength(patterns);
    }
    const q = (await eslint().calculateConfigForFile(path.join(cwd, "src/modules/user/user.queries.ts"))) as Linter.Config;
    const qo = (q.rules?.["no-restricted-imports"] as [string, { patterns: unknown[]; paths: unknown[] }])[1];
    expect([qo.patterns.length, qo.paths.length]).toEqual([1, 1]);

    // And no unrelated file is restricted at all.
    const other = (await eslint().calculateConfigForFile(path.join(cwd, "src/server/db/client.ts"))) as Linter.Config;
    expect(other.rules?.["no-restricted-imports"]).toBeUndefined();
  });
});
