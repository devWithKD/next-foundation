import type { Rule } from "eslint";
import { importVisitors } from "../ast.js";
import { resolveImport } from "../paths.js";
import { getSettings, isUnder, relativeFilename } from "../settings.js";

/** The folder an `_actions` file or directory belongs to, or null if the path isn't one. */
function routeFolderOf(resolved: string): string | null {
  const segments = resolved.split("/");
  const i = segments.indexOf("_actions");
  return i === -1 ? null : segments.slice(0, i).join("/");
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Only files inside a route folder may import that folder's `_actions`." },
    schema: [],
    messages: {
      foreign: "`{{source}}` belongs to the route folder `{{folder}}`. Server actions can only be imported from inside it.",
    },
  },
  create(context) {
    const settings = getSettings(context);
    const rel = relativeFilename(context);
    if (rel === null) return {};

    return importVisitors(({ node, source, typeOnly }) => {
      // A type import is erased, so it never reaches the action.
      if (typeOnly) return;
      const resolved = resolveImport(rel, source, settings);
      if (resolved === null) return;
      const folder = routeFolderOf(resolved);
      if (folder === null) return;
      if (!isUnder(rel, folder)) context.report({ node, messageId: "foreign", data: { source, folder } });
    });
  },
};

export default rule;
