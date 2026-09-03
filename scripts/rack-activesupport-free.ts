/**
 * The Ruby `rack` gem has no runtime dependencies, and `rack-session` depends
 * only on `rack` — so `@blazetrails/rack` and `@blazetrails/rack-session`
 * declaring `@blazetrails/activesupport` was a fidelity deviation with nothing
 * tracking it. RFC 0135 moved the platform adapters and the Ruby core seats
 * those packages actually wanted into `@blazetrails/ruby-compat`; this guard is
 * the acceptance test, and it exists so the edge cannot come back silently the
 * way it arrived.
 *
 * It checks the same two halves `ruby-compat-leaf.ts` checks, against a named
 * forbidden package rather than the Node builtins:
 *
 * - No BUILT runtime module names an `@blazetrails/activesupport` specifier —
 *   built, because a workspace edge is only visible transitively in `src/**`.
 * - Neither manifest declares it in `dependencies` / `peerDependencies`.
 *
 * The sources are checked too, tests included, because a test file importing
 * activesupport never reaches `dist/` and would still resolve today by hoisting
 * — an undeclared edge is the way the declared one grows back.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { declaredDependencies, moduleSpecifiers } from "./ruby-compat-leaf.js";

export const FORBIDDEN_PACKAGE = "@blazetrails/activesupport";

/** The packages the Ruby gems give no runtime dependencies of this kind. */
export const GUARDED_PACKAGES = ["rack", "rack-session"];

/** True when a specifier names the package itself or one of its subpaths. */
export function namesPackage(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

async function filesWithExtension(dir: string, extension: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await filesWithExtension(path.join(dir, entry.name), extension, rel)));
    } else if (entry.name.endsWith(extension)) {
      out.push(rel);
    }
  }
  return out;
}

export interface ForbiddenImport {
  file: string;
  specifier: string;
}

/**
 * Every import of `packageName` under `subdir` of `packageDir`, in file order.
 * Throws when the directory is absent rather than reporting nothing — a guard
 * that passes on an unbuilt tree is a no-op.
 */
export async function forbiddenImports(
  packageDir: string,
  subdir: string,
  extension: string,
  packageName: string,
): Promise<ForbiddenImport[]> {
  const root = path.join(packageDir, subdir);
  let files: string[];
  try {
    files = await filesWithExtension(root, extension);
  } catch {
    throw new Error(`${root} is missing — build the package before running this guard.`);
  }
  const found: ForbiddenImport[] = [];
  for (const file of files.sort()) {
    const source = await readFile(path.join(root, file), "utf-8");
    for (const { specifier } of moduleSpecifiers(source)) {
      if (namesPackage(specifier, packageName)) found.push({ file, specifier });
    }
  }
  return found;
}

/** The forbidden package, if either manifest field declares it. */
export async function declaresForbiddenPackage(
  packageDir: string,
  packageName: string,
): Promise<string[]> {
  const declared = await declaredDependencies(packageDir);
  return declared.filter((entry) => entry.endsWith(`: ${packageName}`));
}
