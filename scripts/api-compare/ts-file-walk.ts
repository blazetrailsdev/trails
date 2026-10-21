/**
 * The `.ts` tree-walking primitive shared by api-compare's scripts.
 *
 * There are two deliberate populations, and they are not interchangeable:
 *
 * - `COMMITTED_TS_FILES` — what is *committed* under `packages/<pkg>/src`.
 *   The JSDoc lints (`parity:api:reasons`, `parity:api:detached`) police source text, so
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
 *  `<pkg>/src` layer (`parity:api:detached` walks `scripts/` with it). A missing
 *  directory yields no files rather than throwing.
 *
 *  `skipDirs` is pruned *during* the descent, so a skipped subtree is never
 *  read. Enumerating the whole tree with one `readdir(dir, { recursive: true })`
 *  and filtering after could not prune: it listed every path under each
 *  per-workspace `node_modules` before discarding it — 2.2M entries under
 *  `scripts/`, which is the allocation that reached `parity:api:detached`'s 4GB
 *  heap limit on CI — and it read a chain inside one of those trees that
 *  `scandir` answers `ELOOP` for, which the `catch` below turns into "no
 *  files", silently dropping the whole of `scripts/` from the lint's
 *  population.
 *
 *  A symlinked directory is descended into, as `recursive: true` did:
 *  `fixtures/all/admin` mirrors Rails' symlinked fixture layout, and a `Dirent`
 *  for a symlink answers `isDirectory()` false. The guard against a cycle is
 *  the chain of ancestor realpaths, not a set of every directory seen: the same
 *  real directory reached by two sibling paths is listed under both, as
 *  `fixtures/all/admin` and `fixtures/to-be-linked` are, and only an ancestor
 *  repeating itself is a loop. */
export async function walkTsFiles(dir: string, population: TsFilePopulation): Promise<string[]> {
  const isDirectory = async (target: string): Promise<boolean> => {
    try {
      return (await fsPromises.stat(target)).isDirectory();
    } catch {
      return false;
    }
  };
  const walk = async (current: string, ancestors: ReadonlySet<string>): Promise<string[]> => {
    let entries: fs.Dirent[];
    let real: string;
    try {
      real = await fsPromises.realpath(current);
      if (ancestors.has(real)) return [];
      entries = await fsPromises.readdir(current, { withFileTypes: true });
    } catch {
      return [];
    }
    const chain = new Set(ancestors).add(real);
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory() || (entry.isSymbolicLink() && (await isDirectory(fullPath)))) {
        if (population.skipDirs.has(entry.name)) continue;
        results.push(...(await walk(fullPath, chain)));
      } else if (population.includeFile(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  };
  return walk(dir, new Set());
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
