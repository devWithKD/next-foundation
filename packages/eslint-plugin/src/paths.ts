import path from "node:path";
import type { KedarSettings } from "./settings.js";

const EXT = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export const stripExt = (p: string) => p.replace(EXT, "");
export const isTestFile = (p: string) => TEST_FILE.test(p);

/**
 * Resolves an import specifier to a project-relative path without extension,
 * or null for packages and anything we can't place. Relative imports and the
 * configured aliases only: a package import never resolves into the project.
 */
export function resolveImport(importerRel: string, source: string, settings: KedarSettings): string | null {
  if (source === "." || source === ".." || source.startsWith("./") || source.startsWith("../")) {
    return stripExt(path.posix.normalize(path.posix.join(path.posix.dirname(importerRel), source)));
  }
  const prefixes = Object.keys(settings.alias).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (source.startsWith(prefix)) {
      return stripExt(path.posix.normalize(path.posix.join(settings.alias[prefix] as string, source.slice(prefix.length))));
    }
  }
  return null;
}

/** "role-template.service" → "service"; undefined when the name has no suffix. */
export function fileSuffix(pathNoExt: string): string | undefined {
  const parts = path.posix.basename(pathNoExt).split(".");
  return parts.length > 1 ? parts[parts.length - 1] : undefined;
}

/**
 * The module folder name for a path under `modulesDir`, e.g. "role-template".
 * `resolvedImport` is for extensionless import targets, where `modulesDir/user`
 * is the module's folder; a linted file directly in `modulesDir` has no module.
 */
export function moduleOf(p: string, modulesDir: string, resolvedImport = false): string | undefined {
  if (!p.startsWith(`${modulesDir}/`)) return undefined;
  const rest = p.slice(modulesDir.length + 1);
  if (rest.includes("/")) return rest.slice(0, rest.indexOf("/"));
  return resolvedImport ? rest : undefined;
}
