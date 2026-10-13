import type { Rule } from "eslint";
import { importVisitors } from "../ast.js";
import { fileSuffix, isTestFile, moduleOf, resolveImport } from "../paths.js";
import { getSettings, globToRegExp, isUnder, relativeFilename } from "../settings.js";

export const DEFAULT_ALLOW: Record<string, string[]> = {
  "*": ["service", "contract", "keys"],
  // Foreign-key references.
  sql: ["sql"],
  // Read models join across modules.
  queries: ["sql", "contract", "keys"],
  // Precondition reads inside a command (e.g. counting assigned users). Writing
  // another aggregate's table is still a review error.
  repository: ["sql"],
};

type Options = [{ allow?: Record<string, string[]>; serverAllow?: string[] }?];

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Modules reach each other only through each other's service, contract or keys." },
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
          serverAllow: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      foreignModule:
        "{{from}} ({{kind}}) can't import {{to}}'s {{targetKind}} file. A {{kind}} file may import from other modules only: {{allowed}}.",
      serverImportsModule:
        "`{{dir}}` can't import from `{{modules}}` at runtime. Only the composition root may: {{allowed}}. Use `import type`, or go through `services.ts`.",
    },
  },
  create(context) {
    const settings = getSettings(context);
    const options = (context.options as Options)[0] ?? {};
    const allow = { ...DEFAULT_ALLOW, ...options.allow };
    const serverAllowGlobs = options.serverAllow ?? [
      `${settings.serverDir}/services.ts`,
      `${settings.serverDir}/db/schema.ts`,
      `${settings.serverDir}/adapters.ts`,
      `${settings.serverDir}/auth/**`,
    ];
    const serverAllow = serverAllowGlobs.map(globToRegExp);

    const rel = relativeFilename(context);
    if (rel === null || isTestFile(rel)) return {};

    const importerModule = moduleOf(rel, settings.modulesDir);
    const inServer = isUnder(rel, settings.serverDir);
    if (importerModule === undefined && !inServer) return {};

    const importerSuffix = fileSuffix(rel.replace(/\.[cm]?[jt]sx?$/, ""));

    return importVisitors(({ node, source, typeOnly }) => {
      if (typeOnly) return;
      const resolved = resolveImport(rel, source, settings);
      if (resolved === null || !isUnder(resolved, settings.modulesDir)) return;

      if (importerModule === undefined) {
        // A file in serverDir.
        if (serverAllow.some((re) => re.test(rel))) return;
        context.report({
          node,
          messageId: "serverImportsModule",
          data: { dir: settings.serverDir, modules: settings.modulesDir, allowed: serverAllowGlobs.join(", ") },
        });
        return;
      }

      const targetModule = moduleOf(resolved, settings.modulesDir, true);
      if (targetModule === undefined || targetModule === importerModule) return;

      const targetSuffix = fileSuffix(resolved);
      const allowed = (importerSuffix !== undefined ? allow[importerSuffix] : undefined) ?? allow["*"] ?? [];
      if (targetSuffix !== undefined && allowed.includes(targetSuffix)) return;

      context.report({
        node,
        messageId: "foreignModule",
        data: {
          from: importerModule,
          kind: importerSuffix ?? "module",
          to: targetModule,
          targetKind: targetSuffix ?? "index",
          allowed: allowed.join(", "),
        },
      });
    });
  },
};

export default rule;
