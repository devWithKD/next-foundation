import fs from "node:fs";
import path from "node:path";
import type { Rule } from "eslint";
import type * as ES from "estree";
import { hasUseServer } from "../ast.js";
import { getSettings, isUnder, relativeFilename } from "../settings.js";

const ENTRY = /^(page|layout)\.(tsx|ts|jsx|js)$/;
const LEGACY_NAME = /\.actions?\.[cm]?[jt]sx?$/;
const ACTIONS_FILE = /^_actions\.[cm]?[jt]sx?$/;

function hasPageOrLayout(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((name) => ENTRY.test(name));
  } catch {
    return false;
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Server actions live in `_actions.ts` or `_actions/` beside the page or layout that calls them." },
    schema: [],
    messages: {
      legacyName:
        "`*.action(s).ts` files are not allowed. Put server actions in `_actions.ts` (or an `_actions/` folder) beside the page or layout that calls them.",
      outsideApp: "A \"use server\" file must live under `{{appDir}}`, in `_actions.ts` or `_actions/`, beside the page or layout that calls it.",
      wrongName: "A \"use server\" file must be named `_actions.ts` or sit directly inside an `_actions/` folder.",
      noRouteEntry: "`{{dir}}` has no page or layout. Server actions must sit beside the page or layout that calls them.",
      inline: "Inline \"use server\" in a function body is not allowed: it bypasses `createAction`. Move it to `_actions.ts`.",
    },
  },
  create(context) {
    const settings = getSettings(context);
    const rel = relativeFilename(context);
    if (rel === null || !isUnder(rel, settings.srcDir)) return {};

    const base = path.posix.basename(rel);
    const inlineVisitor = (node: ES.Function) => {
      if (node.body.type !== "BlockStatement" || !hasUseServer(node.body.body)) return;
      context.report({ node, messageId: "inline" });
    };

    return {
      Program(program) {
        if (LEGACY_NAME.test(base)) {
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "legacyName" });
        }
        if (!hasUseServer(program.body)) return;

        if (!isUnder(rel, settings.appDir)) {
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "outsideApp", data: { appDir: settings.appDir } });
          return;
        }
        const dir = path.posix.dirname(rel);
        let routeFolder: string;
        if (ACTIONS_FILE.test(base)) routeFolder = dir;
        else if (path.posix.basename(dir) === "_actions") routeFolder = path.posix.dirname(dir);
        else {
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "wrongName" });
          return;
        }
        if (!hasPageOrLayout(path.resolve(context.cwd, routeFolder))) {
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: "noRouteEntry", data: { dir: routeFolder } });
        }
      },
      FunctionDeclaration: inlineVisitor,
      FunctionExpression: inlineVisitor,
      ArrowFunctionExpression: inlineVisitor,
    };
  },
};

export default rule;
