/**
 * Guard against measuring `api:compare` / `api:extra` against a BUILD that
 * belongs to a different commit than the checked-out sources.
 *
 * The TS extractor compiles each package with the real module resolver, so an
 * `import { … } from "@blazetrails/activesupport"` resolves through pnpm's
 * `node_modules` symlink into `packages/activesupport/dist/*.d.ts`. The
 * extracted surface of the IMPORTER therefore depends on the sibling's BUILD
 * OUTPUT, not on its sources.
 *
 * `dist/` is untracked build output, so `git checkout` does not update it. The
 * documented way to take an `api:extra` baseline — `git checkout --detach
 * origin/main` in the same worktree, run, then check the branch back out — thus
 * measures `origin/main`'s sources against the BRANCH's `dist`. Nothing in the
 * cache layer can repair this: the shared cache is content-keyed and the entries
 * record their resolved read-set, so the caches correctly serve what a fresh
 * extraction would produce — a fresh extraction of a mismatched tree. The result
 * is a phantom delta on packages the diff never touched, which is exactly the
 * failure this module exists to make loud.
 *
 * Detection is mtime-based on purpose. `git checkout` rewrites the mtime of
 * every file whose contents it changes and leaves the rest alone, so "some
 * source under `packages/<dir>` is newer than the newest declaration in
 * `packages/<dir>/dist`" is precisely "this package's build predates the
 * checked-out sources". A package with no `dist` at all is NOT stale: nothing
 * was built, so nothing can be out of date, and cross-package imports simply
 * fail to resolve uniformly at every commit.
 *
 * Constraints: async fs only, no `node:` specifiers, no `process` references.
 */
import * as fs from "fs/promises";
import * as path from "path";

/** One package whose `dist` predates its own sources. */
export interface StaleBuild {
  /** Directory name under `packages/` (not the api-compare package key). */
  dir: string;
  /** Repo-relative path of the newest source file, for the error message. */
  newestSource: string;
}

/** Newest mtime under `dir` for files passing `keep`, or null if there are none. */
async function newestMtime(
  dir: string,
  keep: (name: string) => boolean,
): Promise<{ mtimeMs: number; file: string } | null> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return newestMtime(full, keep);
      if (!keep(entry.name)) return null;
      try {
        const stat = await fs.stat(full);
        return { mtimeMs: stat.mtimeMs, file: full };
      } catch {
        return null;
      }
    }),
  );
  let best: { mtimeMs: number; file: string } | null = null;
  for (const candidate of found) {
    if (candidate && (!best || candidate.mtimeMs > best.mtimeMs)) best = candidate;
  }
  return best;
}

const isSource = (name: string) => name.endsWith(".ts") && !name.endsWith(".d.ts");
const isDeclaration = (name: string) => name.endsWith(".d.ts");

/**
 * Every package under `packagesDir` that HAS a `dist` whose newest declaration
 * is older than the newest file in its `src`. Packages without a `dist`, or
 * without a `src`, are skipped (see the module comment).
 *
 * `rootDir` only anchors the reported path so the message is repo-relative.
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
        newestMtime(path.join(packageDir, "src"), isSource),
        newestMtime(path.join(packageDir, "dist"), isDeclaration),
      ]);
      if (!source || !built) return null;
      if (source.mtimeMs <= built.mtimeMs) return null;
      return { dir, newestSource: path.relative(rootDir, source.file).replace(/\\/g, "/") };
    }),
  );
  return checked.filter((entry): entry is StaleBuild => entry !== null).sort(byDir);
}

function byDir(a: StaleBuild, b: StaleBuild): number {
  return a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0;
}

/** The operator-facing failure text for a non-empty `staleBuilds` result. */
export function staleBuildMessage(stale: StaleBuild[]): string {
  const lines = stale.map((entry) => `  packages/${entry.dir} — newer: ${entry.newestSource}`);
  return [
    `api:compare would measure ${stale.length} package(s) against a stale build:`,
    ...lines,
    "",
    "Cross-package imports resolve through packages/<pkg>/dist/*.d.ts, which git",
    "does not update on checkout, so these totals would mix one commit's sources",
    "with another commit's build output. Run `pnpm build` and re-run.",
    "Set API_COMPARE_ALLOW_STALE_BUILD=1 to measure anyway (totals are not a",
    "trustworthy baseline).",
  ].join("\n");
}
