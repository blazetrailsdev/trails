/**
 * Guard against measuring `api:compare` / `api:extra` against a BUILD that does
 * not correspond to the checked-out sources — one belonging to a different
 * commit, or (see `staleBuilds`) no build at all.
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
 * WHY `tsc`'S OWN ORACLE AND NOT mtimes. The obvious check — "is some source
 * newer than the newest `.d.ts`?" — is wrong, and CI proves it. `cache-build`
 * restores `packages/<pkg>/dist` plus `tsconfig.tsbuildinfo` from a tarball keyed on
 * a CONTENT hash of every package `src/`, so the restored outputs carry their
 * ARCHIVE mtimes while `actions/checkout` has just written every source at
 * "now". `pnpm build` then correctly no-ops (the buildinfo agrees with the
 * sources), leaving a tree that is perfectly current but looks, by mtime, like
 * every package is stale. An mtime guard fails all 13 packages on every CI run
 * while contradicting the build that just succeeded.
 *
 * So we ask the authority instead. `ts.createSolutionBuilder` exposes the same
 * up-to-date computation `tsc --build` uses, which is what wrote the outputs in
 * the first place. By construction the guard can never disagree with a build
 * that just succeeded, and it still reports `OutOfDateWithSelf` the moment a
 * checkout rewrites a source — including a delete-only checkout, which moves the
 * project's root file set rather than any surviving file's mtime.
 *
 * Constraints: async fs only, no `node:` specifiers, no `process` references.
 * The `typescript` import is the one unavoidable exception — its `ts.sys` I/O is
 * synchronous and internal to the compiler. That is the point: reusing tsc's
 * own reader is what makes this agree with tsc.
 */
import * as fs from "fs/promises";
import * as path from "path";
import ts from "typescript";
import type { PackageRoots } from "./config.js";

/**
 * Reported for a project that has no `dist` at all. Not one of tsc's statuses —
 * tsc calls such a project up to date whenever its `tsconfig.tsbuildinfo`
 * survived — so the guard mints it itself. See `staleBuilds`.
 */
export const NOT_BUILT = "NotBuilt";

/** One package whose build does not correspond to its checked-out sources. */
export interface StaleBuild {
  /** Directory name under `packages/` (not the api-compare package key). */
  dir: string;
  /** `tsc`'s own verdict, e.g. `OutOfDateWithSelf`, or `NotBuilt`. */
  status: string;
}

/**
 * The `UpToDateStatusType`s that mean "the emitted output does not correspond
 * to these sources". Enumerated positively rather than as "anything that isn't
 * up to date" so a status we did not anticipate (`ContainerOnly`, `ForceBuild`,
 * `ComputingUpstream`) cannot start failing runs after a TypeScript upgrade.
 * `Unbuildable` / `ErrorReadingFile` are likewise excluded: a project that
 * cannot build is a compile error to surface on its own, not a stale baseline.
 */
const STALE_STATUSES: ReadonlySet<ts.UpToDateStatusType> = new Set([
  ts.UpToDateStatusType.OutputMissing,
  ts.UpToDateStatusType.OutOfDateWithSelf,
  ts.UpToDateStatusType.OutOfDateWithUpstream,
  ts.UpToDateStatusType.OutOfDateBuildInfoWithPendingEmit,
  ts.UpToDateStatusType.OutOfDateBuildInfoWithErrors,
  ts.UpToDateStatusType.OutOfDateOptions,
  ts.UpToDateStatusType.OutOfDateRoots,
  ts.UpToDateStatusType.UpstreamOutOfDate,
  ts.UpToDateStatusType.UpstreamBlocked,
  ts.UpToDateStatusType.TsVersionOutputOfDate,
]);

/** A project in the reference closure: where it builds to, and what to call it. */
interface Project {
  dir: string;
  configPath: string;
  distDir: string;
}

const PARSE_HOST: ts.ParseConfigFileHost = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: () => {},
};

/**
 * Every project reachable from `seeds` through `references`, including the
 * seeds themselves.
 *
 * Checking only the api-compared packages is not enough: a package can import
 * declaration output from a workspace that is NOT api-compared — `actionview`
 * references `@blazetrails/tse-compiler` — and tsc reports the IMPORTER as
 * `UpToDateWithUpstreamTypes` when such a reference goes stale, which is not an
 * out-of-date status. The stale `dist/*.d.ts` would still be what the extractor
 * reads, so the referenced project has to be asked about directly.
 *
 * This does not undo the scoping: the closure is reachability from packages
 * api-compare actually extracts, so a workspace nothing references
 * (`activerecord-cli`, `website`) is still never consulted.
 */
function referenceClosure(seeds: readonly Project[]): Project[] {
  const found = new Map<string, Project>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const project = queue.pop()!;
    if (found.has(project.configPath)) continue;
    found.set(project.configPath, project);
    const parsed = ts.getParsedCommandLineOfConfigFile(project.configPath, {}, PARSE_HOST);
    for (const reference of parsed?.projectReferences ?? []) {
      const configPath = resolveProjectConfig(reference.path);
      if (configPath && !found.has(configPath)) queue.push(toProject(configPath));
    }
  }
  return [...found.values()];
}

/** A `references` entry may name a directory or the tsconfig itself. */
function resolveProjectConfig(referencePath: string): string | null {
  if (referencePath.endsWith(".json")) return referencePath;
  const candidate = path.join(referencePath, "tsconfig.json");
  return ts.sys.fileExists(candidate) ? candidate : null;
}

function toProject(configPath: string): Project {
  const projectDir = path.dirname(configPath);
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, PARSE_HOST);
  return {
    dir: path.basename(projectDir),
    configPath,
    distDir: parsed?.options.outDir ?? path.join(projectDir, "dist"),
  };
}

/** Whether `dir` holds at least one `.d.ts` — i.e. the package was ever built. */
async function hasDeclarations(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (await hasDeclarations(path.join(dir, entry.name))) return true;
    } else if (entry.name.endsWith(".d.ts")) {
      return true;
    }
  }
  return false;
}

/**
 * Every root in `roots` whose build does not correspond to its sources.
 *
 * `roots` is the extractor's own package set (`apiComparePackageRoots`), NOT a
 * listing of `packages/` — a workspace api-compare never extracts cannot affect
 * the manifest and must not be able to block a run. Roots sharing a directory
 * (the four actionpack packages) share one tsconfig and collapse to one report.
 *
 * A root with no `dist` is reported as `NotBuilt`. It was once treated as
 * benign ("resolves to nothing at every commit, so it's consistent"), and that
 * is measurably false: on an UNBUILT worktree the extractor cannot resolve a
 * type an importer pulls from a sibling package's declarations, so the method
 * carrying it silently leaves whichever population needed that type.
 * `serializableHash` (activerecord/serialization.ts) takes its options type
 * from activemodel, and the option-key summary prints 103 pairs on an unbuilt
 * tree against 104 on the same tree after `pnpm build`. (Only the option-key
 * total moved on that tree — arity, literals and calls were identical — but
 * nothing confines the mechanism to option keys; any total read off a
 * cross-package type can move the same way.) A run-order-dependent total is
 * exactly the fabricated ±1 this guard exists to prevent, so an unbuilt package
 * has to fail the same way a stale one does.
 *
 * `NotBuilt` is ours rather than tsc's on purpose — tsc reports a project whose
 * `dist` was deleted but whose `tsconfig.tsbuildinfo` survives as up to date,
 * so deferring to it would let a removed build through.
 */
export async function staleBuilds(roots: readonly PackageRoots[]): Promise<StaleBuild[]> {
  const seeds = new Map<string, Project>();
  for (const root of roots) {
    seeds.set(root.configPath, {
      dir: root.dir,
      configPath: root.configPath,
      distDir: root.distDir,
    });
  }
  const candidates = referenceClosure([...seeds.values()]);
  const hasDist = await Promise.all(candidates.map((project) => hasDeclarations(project.distDir)));
  const built = candidates.filter((_, i) => hasDist[i]);
  const stale: StaleBuild[] = candidates
    .filter((_, i) => !hasDist[i])
    .map((project) => ({ dir: project.dir, status: NOT_BUILT }));

  if (built.length > 0) {
    const builder = ts.createSolutionBuilder(
      ts.createSolutionBuilderHost(ts.sys),
      built.map((project) => project.configPath),
      {},
    );
    for (const project of built) {
      const status = builder.getUpToDateStatusOfProject(project.configPath);
      if (STALE_STATUSES.has(status.type)) {
        stale.push({ dir: project.dir, status: ts.UpToDateStatusType[status.type] });
      }
    }
  }
  return stale.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

/**
 * Whether `manifestPath` predates the sources it claims to describe.
 *
 * `api:extra` reads the manifests `api:compare` left behind rather than
 * re-extracting, so running it alone after a checkout reports the PREVIOUS
 * commit's totals with nothing to signal it — the same stale baseline the build
 * guard exists to stop, one step further downstream.
 *
 * mtimes ARE the right oracle here, unlike for `dist`: the manifest is written
 * by a local run that just read those sources, never restored from an archive,
 * so nothing can rewind its timestamp below theirs. Missing manifests are not
 * stale; the caller already has a better error for that.
 */
export async function manifestIsStale(
  manifestPath: string,
  roots: readonly PackageRoots[],
): Promise<boolean> {
  let manifestMtime: number;
  try {
    manifestMtime = (await fs.stat(manifestPath)).mtimeMs;
  } catch {
    return false;
  }
  const newest = await Promise.all(roots.map((root) => newestSourceMtime(root.srcDir)));
  const newestSource = newest.reduce((a, b) => (b > a ? b : a), 0);
  return newestSource > manifestMtime;
}

/**
 * Newest mtime at or under `dir` among `.ts` sources AND the directories
 * themselves, or 0 if unreadable. Directories count so a checkout that only
 * DELETES a file — every surviving file keeps its mtime, only the parent
 * directory moves — is still seen.
 */
async function newestSourceMtime(dir: string): Promise<number> {
  let entries;
  let newest = 0;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
    newest = (await fs.stat(dir)).mtimeMs;
  } catch {
    return 0;
  }
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return newestSourceMtime(full);
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) return 0;
      try {
        return (await fs.stat(full)).mtimeMs;
      } catch {
        return 0;
      }
    }),
  );
  return found.reduce((a, b) => (b > a ? b : a), newest);
}

/** The operator-facing failure text for a non-empty `staleBuilds` result. */
export function staleBuildMessage(stale: StaleBuild[]): string {
  const missing = stale.filter((entry) => entry.status === NOT_BUILT).length;
  const noun = missing === stale.length ? "a missing build" : "a stale build";
  return [
    `api:compare would measure ${stale.length} package(s) against ${noun}:`,
    ...stale.map((entry) => `  packages/${entry.dir} — ${entry.status}`),
    "",
    "Cross-package imports resolve through packages/<pkg>/dist/*.d.ts, so what",
    "the extractor sees depends on those declarations. Run `pnpm build` and",
    "re-run.",
    ...(missing < stale.length
      ? [
          "",
          "git does not update dist on checkout, so a stale one makes these totals",
          "mix one commit's sources with another commit's build output.",
        ]
      : []),
    ...(missing > 0
      ? [
          "",
          `${missing} of those have no dist at all. An unbuilt package does not`,
          "resolve to nothing harmlessly: a type an importer pulls from it goes",
          "unresolved, and the method carrying it drops out of the advisory",
          "populations — the option-key summary alone moves by a pair — so the",
          "totals change on the next run purely because a build happened in",
          "between.",
        ]
      : []),
    "",
    "API_COMPARE_FORCE=1 does NOT fix this — it clears the extractor caches",
    "(local mtime-keyed and shared content-keyed) and nothing else; build state",
    "is not a cache. Set API_COMPARE_ALLOW_STALE_BUILD=1 to measure anyway",
    "(totals are not a trustworthy baseline).",
  ].join("\n");
}
