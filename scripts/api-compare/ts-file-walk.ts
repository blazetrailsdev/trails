/**
 * The `.ts` tree-walking primitive shared by api-compare's scripts.
 *
 * There are two deliberate populations, and they are not interchangeable:
 *
 * - `COMMITTED_TS_FILES` — what is *committed* under `packages/<pkg>/src`.
 *   The JSDoc lints (`api:reasons`, `api:detached`) police source text, so
 *   `*.test.ts` and `*.d.ts` count, and only build/vendor output is skipped.
 * - `COMPARED_TS_FILES` — what api-compare *measures against Rails*. Tests and
 *   declaration files are not part of the ported surface, so they are out.
 *
 * The sync/async split below is a constraint, not an oversight: the lints must
 * use async fs, while the extractor walks from synchronous code paths
 * (including worker threads).
 *
 * Hard rules: no node:* imports, no process.* references.
 */

import * as fs from "fs";
import * as fsPromises from "fs/promises";
import * as path from "path";

export interface TsFilePopulation {
  /** Directory *names* pruned during traversal, at any depth. */
  readonly skipDirs: ReadonlySet<string>;
  /** Whether a file's basename belongs to this population. */
  readonly includeFile: (name: string) => boolean;
}

export const COMMITTED_TS_FILES: TsFilePopulation = {
  skipDirs: new Set(["node_modules", "dist"]),
  includeFile: (name) => name.endsWith(".ts"),
};

export const COMPARED_TS_FILES: TsFilePopulation = {
  // No name-based pruning: the extractor's callers pass the exact subtrees to
  // skip as full-path `excludeDirs`, and its roots are package `src` dirs.
  skipDirs: new Set(),
  includeFile: (name) =>
    name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts"),
};

/** Every file of `population` under `dir`, in `readdir` order.
 *  `excludeDirs` holds *full paths* (not names) of subtrees to prune. */
export function walkTsFilesSync(
  dir: string,
  population: TsFilePopulation,
  excludeDirs: readonly string[] = [],
): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (excludeDirs.includes(fullPath) || population.skipDirs.has(entry.name)) continue;
      results.push(...walkTsFilesSync(fullPath, population, excludeDirs));
    } else if (population.includeFile(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Every file of `population` under `dir`, recursively, in `readdir` order.
 *  The flat async counterpart to `walkTsFilesSync`, for roots with no
 *  `<pkg>/src` layer (`api:detached` walks `scripts/` with it). A missing
 *  directory yields no files rather than throwing. */
export async function walkTsFiles(dir: string, population: TsFilePopulation): Promise<string[]> {
  let names: string[];
  try {
    names = await fsPromises.readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  return names
    .filter((name) => population.includeFile(path.basename(name)))
    .filter((name) => !name.split(path.sep).some((seg) => population.skipDirs.has(seg)))
    .map((name) => path.join(dir, name));
}

/** Every file of `population` under `<packagesDir>/<pkg>/src`, sorted for
 *  stable output. Missing directories yield no files rather than throwing. */
export async function walkPackageTsFiles(
  packagesDir: string,
  population: TsFilePopulation,
): Promise<string[]> {
  let pkgs: string[];
  try {
    pkgs = (await fsPromises.readdir(packagesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const perPackage = await Promise.all(
    pkgs.map((pkg) => walkTsFiles(path.join(packagesDir, pkg, "src"), population)),
  );
  return perPackage.flat().sort();
}
