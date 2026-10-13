import path from "node:path";
import type { Rule } from "eslint";

/** Shared project layout, read from `settings.kedar` in the flat config. */
export type KedarSettings = {
  srcDir: string;
  appDir: string;
  modulesDir: string;
  serverDir: string;
  /** Import alias → directory, e.g. { "@/": "src/" }. Relative to the project root. */
  alias: Record<string, string>;
};

export const DEFAULT_SETTINGS: KedarSettings = {
  srcDir: "src",
  appDir: "src/app",
  modulesDir: "src/modules",
  serverDir: "src/server",
  alias: { "@/": "src/" },
};

const toPosix = (p: string) => p.split(path.sep).join("/");

/** "./src/app/" → "src/app" */
export function cleanDir(dir: string): string {
  return path.posix.normalize(toPosix(dir)).replace(/^\.\//, "").replace(/\/+$/, "");
}

export function getSettings(context: Rule.RuleContext): KedarSettings {
  const user = ((context.settings as Record<string, unknown> | undefined)?.kedar ?? {}) as Partial<KedarSettings>;
  const merged = { ...DEFAULT_SETTINGS, ...user };
  return {
    srcDir: cleanDir(merged.srcDir),
    appDir: cleanDir(merged.appDir),
    modulesDir: cleanDir(merged.modulesDir),
    serverDir: cleanDir(merged.serverDir),
    alias: Object.fromEntries(Object.entries(merged.alias).map(([k, v]) => [k, cleanDir(v)])),
  };
}

export function projectRoot(context: Rule.RuleContext): string {
  return context.cwd;
}

/** The linted file relative to the project root, with forward slashes. null when outside it. */
export function relativeFilename(context: Rule.RuleContext): string | null {
  const rel = toPosix(path.relative(projectRoot(context), context.filename));
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel;
}

export function isUnder(rel: string, dir: string): boolean {
  return rel === dir || rel.startsWith(`${dir}/`);
}

/** Minimal glob: `**` matches anything, `*` matches within one path segment. */
export function globToRegExp(glob: string): RegExp {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      out += ".*";
      i++;
      if (glob[i + 1] === "/") i++; // "a/**/b" also matches "a/b"
    } else if (c === "*") out += "[^/]*";
    else out += c.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}
