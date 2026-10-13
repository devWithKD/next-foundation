import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, it } from "vitest";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
(RuleTester as unknown as { afterAll: typeof afterAll }).afterAll = afterAll;

export const FIXTURES = "test/fixtures/src";

export const settings = {
  foundation: {
    srcDir: FIXTURES,
    appDir: `${FIXTURES}/app`,
    modulesDir: `${FIXTURES}/modules`,
    serverDir: `${FIXTURES}/server`,
    alias: { "@/": `${FIXTURES}/` },
  },
};

export const tester = () =>
  new RuleTester({
    languageOptions: { parser: tseslint.parser, ecmaVersion: "latest", sourceType: "module" },
    settings,
  });

/** An absolute path for a file inside the fixture tree. */
export const file = (rel: string) => path.join(process.cwd(), FIXTURES, rel);
