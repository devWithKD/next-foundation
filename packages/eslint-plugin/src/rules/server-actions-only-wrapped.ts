import type { Rule } from "eslint";
import type * as ES from "estree";
import { hasUseServer } from "../ast.js";

type Options = [{ callees?: string[] }?];

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: 'Every export of a "use server" file must be `export const x = createAction(...)` (or a type).' },
    schema: [{ type: "object", properties: { callees: { type: "array", items: { type: "string" }, minItems: 1 } }, additionalProperties: false }],
    messages: {
      notWrapped:
        'Every export of a "use server" file is a public endpoint. Export `const {{name}} = {{callee}}(...)`, never a bare function, default, re-export or value.',
    },
  },
  create(context) {
    const callees = (context.options as Options)[0]?.callees ?? ["createAction"];
    const callee = callees[0] as string;
    return {
      Program(program) {
        if (!hasUseServer(program.body)) return;

        const bad = (node: ES.Node, name = "x") => context.report({ node, messageId: "notWrapped", data: { name, callee } });

        for (const stmt of program.body) {
          if (stmt.type === "ExportDefaultDeclaration") bad(stmt, "action");
          else if (stmt.type === "ExportAllDeclaration") {
            if ((stmt as ES.ExportAllDeclaration & { exportKind?: string }).exportKind !== "type") bad(stmt);
          } else if (stmt.type === "ExportNamedDeclaration") {
            const decl = stmt.declaration as { type: string } | null | undefined;
            if (!decl) {
              const kind = (stmt as ES.ExportNamedDeclaration & { exportKind?: string }).exportKind;
              const allTypes = stmt.specifiers.every((s) => (s as unknown as { exportKind?: string }).exportKind === "type");
              if (kind !== "type" && !allTypes) bad(stmt);
            } else if (decl.type === "TSTypeAliasDeclaration" || decl.type === "TSInterfaceDeclaration") {
              continue;
            } else if (decl.type === "VariableDeclaration") {
              const v = decl as ES.VariableDeclaration;
              for (const d of v.declarations) {
                const name = d.id.type === "Identifier" ? d.id.name : "x";
                const init = d.init;
                const wrapped =
                  v.kind === "const" &&
                  d.id.type === "Identifier" &&
                  init?.type === "CallExpression" &&
                  init.callee.type === "Identifier" &&
                  callees.includes(init.callee.name);
                if (!wrapped) bad(d, name);
              }
            } else {
              const id = (decl as { id?: { name?: string } }).id;
              bad(stmt, id?.name ?? "x");
            }
          }
        }
      },
    };
  },
};

export default rule;
