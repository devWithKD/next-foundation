import { z } from "zod";

/**
 * Parses env at call time. Call it at module scope so a bad config crashes at
 * boot instead of surfacing as a runtime 500.
 *
 * GOTCHAS (both bite everyone once):
 * - Client env: `NEXT_PUBLIC_*` values are inlined at build time by literal
 *   text substitution. Pass explicit literals
 *   (`{ NEXT_PUBLIC_X: process.env.NEXT_PUBLIC_X }`), never `process.env`
 *   itself or `process.env[key]`: those are `undefined` in the browser.
 * - Booleans: use `z.stringbool()`. `z.coerce.boolean()` turns the string
 *   "false" into `true`.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, unknown>,
  label = "environment",
): z.output<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    console.error(
      `Invalid ${label}:`,
      JSON.stringify(z.treeifyError(parsed.error), null, 2),
    );
    throw new Error(`Invalid ${label} configuration`);
  }
  return parsed.data;
}
