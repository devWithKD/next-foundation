import type { Rule } from "eslint";
import type * as ES from "estree";

/** The module specifiers of every static import, re-export and literal dynamic import. */
export type ImportRef = { node: ES.Node; source: string; typeOnly: boolean };

type WithKind = { importKind?: string; exportKind?: string; specifiers?: { importKind?: string; exportKind?: string }[] };

function isTypeOnlyImport(node: ES.ImportDeclaration): boolean {
  const n = node as ES.ImportDeclaration & WithKind;
  if (n.importKind === "type") return true;
  // import { type A, type B } from "x": erased entirely only when every specifier is type-only.
  return n.specifiers.length > 0 && (n.specifiers as WithKind[]).every((s) => s.importKind === "type");
}

function isTypeOnlyExport(node: ES.ExportNamedDeclaration | ES.ExportAllDeclaration): boolean {
  const n = node as typeof node & WithKind;
  if (n.exportKind === "type") return true;
  return "specifiers" in node && node.specifiers.length > 0 && (node.specifiers as WithKind[]).every((s) => s.exportKind === "type");
}

export function importVisitors(report: (ref: ImportRef) => void): Rule.RuleListener {
  const literal = (v: ES.Node | null | undefined) => (v && v.type === "Literal" && typeof v.value === "string" ? v.value : undefined);
  return {
    ImportDeclaration(node) {
      const source = literal(node.source);
      if (source !== undefined) report({ node, source, typeOnly: isTypeOnlyImport(node) });
    },
    ExportNamedDeclaration(node) {
      const source = literal(node.source);
      if (source !== undefined) report({ node, source, typeOnly: isTypeOnlyExport(node) });
    },
    ExportAllDeclaration(node) {
      const source = literal(node.source);
      if (source !== undefined) report({ node, source, typeOnly: isTypeOnlyExport(node) });
    },
    ImportExpression(node) {
      const source = literal(node.source);
      if (source !== undefined) report({ node, source, typeOnly: false });
    },
  };
}

/** True when the leading directives of a statement list include "use server". */
export function hasUseServer(body: readonly (ES.Statement | ES.ModuleDeclaration | ES.Directive)[]): boolean {
  for (const stmt of body) {
    if (stmt.type !== "ExpressionStatement") break;
    const directive = (stmt as ES.ExpressionStatement & { directive?: string }).directive;
    if (directive === undefined) break;
    if (directive === "use server") return true;
  }
  return false;
}
