/**
 * Guard against measuring `api:compare` / `api:extra` against a BUILD that
 * belongs to a different commit than the checked-out sources.
 *
 * The TS extractor compiles each package with the real module resolver, so an
 * `import … from "@blazetrails/activesupport"` resolves through pnpm's
 * `node_modules` symlink into `packages/activesupport/dist/*.d.ts` — the
 * extracted surface of the IMPORTER depends on the sibling's BUILD OUTPUT.
 *
 * `dist/` is untracked, so `git checkout` never updates it. Taking an
 * `api:extra` baseline the documented way (check out `origin/main`, measure,
 * check the branch back out) therefore measures one commit's sources against
 * the other commit's build, and packages the diff never touched move. No cache
 * layer can repair that: the shared cache is content-keyed and its entries
 * record their resolved read-set, so it already serves exactly what a fresh
 * extraction of the same mismatched tree would produce.
 *
 * Detection is mtime-based because `git checkout` rewrites the mtime of exactly
 * the paths whose contents it changes. Directory mtimes are folded in so a
 * checkout that only DELETES a source file — which leaves every surviving
 * file's mtime alone but bumps its parent directory — is still caught.
 *
 * Constraints: async fs only, no `node:` specifiers, no `process` references.
 */
import * as fs from "fs/promises";
import * as path from "path";

/** One package whose `dist` predates its own sources. */
export interface StaleBuild {
  /** Directory name under `packages/` (not the api-compare package key). */
  dir: string;
  /** Repo-relative path of the newest source path, for the error message. */
  newestSource: string;
}

interface Newest {
  mtimeMs: number;
  file: string;
}

function later(a: Newest | null, b: Newest | null): Newest | null {
  if (!a) return b;
  if (!b) return a;
  return b.mtimeMs > a.mtimeMs ? b : a;
}

/**
 * Newest mtime at or under `dir` among files passing `keep`, and — when
 * `includeDirs` — the directories themselves. Null if `dir` is unreadable.
 */
async function newestMtime(
  dir: string,
  keep: (name: string) => boolean,
  includeDirs: boolean,
): Promise<Newest | null> {
  let entries;
  let self: Newest | null = null;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
    if (includeDirs) {
      const stat = await fs.stat(dir);
      self = { mtimeMs: stat.mtimeMs, file: dir };
    }
  } catch {
    return null;
  }
  const found = await Promise.all(
    entries.map(async (entry): Promise<Newest | null> => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return newestMtime(full, keep, includeDirs);
      if (!keep(entry.name)) return null;
      try {
        const stat = await fs.stat(full);
        return { mtimeMs: stat.mtimeMs, file: full };
      } catch {
        return null;
      }
    }),
  );
  return found.reduce(later, self);
}

const isSource = (name: string) => name.endsWith(".ts") && !name.endsWith(".d.ts");
const isDeclaration = (name: string) => name.endsWith(".d.ts");

/**
 * Every package under `packagesDir` whose `dist` was built before its current
 * `src`. A package with no `dist` is NOT stale — nothing was built, so nothing
 * can be out of date and cross-package imports fail to resolve uniformly at
 * every commit. `rootDir` only anchors the reported path.
 */
export async function staleBuilds(packagesDir: string, rootDir: string): Promise<StaleBuild[]> {
  let dirs: string[];
  try {
    dirs = await fs.readdir(packagesDir);
  } catch {
    return [];
  }
  const checked = await Promise.all(
    dirs.map(async (dir): Promise<StaleBuild | null> => {
      const packageDir = path.join(packagesDir, dir);
      const [source, built] = await Promise.all([
        newestMtime(path.join(packageDir, "src"), isSource, true),
        newestMtime(path.join(packageDir, "dist"), isDeclaration, false),
      ]);
      if (!source || !built || source.mtimeMs <= built.mtimeMs) return null;
      return { dir, newestSource: path.relative(rootDir, source.file).replace(/\\/g, "/") };
    }),
  );
  return checked
    .filter((entry): entry is StaleBuild => entry !== null)
    .sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/** The operator-facing failure text for a non-empty `staleBuilds` result. */
export function staleBuildMessage(stale: StaleBuild[]): string {
  return [
    `api:compare would measure ${stale.length} package(s) against a stale build:`,
    ...stale.map((entry) => `  packages/${entry.dir} — newer: ${entry.newestSource}`),
    "",
    "Cross-package imports resolve through packages/<pkg>/dist/*.d.ts, which git",
    "does not update on checkout, so these totals would mix one commit's sources",
    "with another commit's build output. Run `pnpm build` and re-run.",
    "Set API_COMPARE_ALLOW_STALE_BUILD=1 to measure anyway (totals are not a",
    "trustworthy baseline).",
  ].join("\n");
}
