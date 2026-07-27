/**
 * Cross-worktree shared cache for `pnpm api:compare`.
 *
 * Every worktree extracts the SAME vendored Rails sources and TS packages, so
 * the expensive extracts (ruby `rails-api.json`, the TS Compiler-API pass)
 * reproduce identical output across worktrees. The in-tree
 * `output/ts-api-cache/<pkg>.json` cache is mtime-keyed and lives inside one
 * worktree, so a fresh worktree (different checkout mtimes) always misses. This
 * module adds a second, CONTENT-keyed layer anchored at the git COMMON dir —
 * shared by every linked worktree — so worktree B reuses worktree A's work.
 * `CACHE_VERSION` namespaces the directory for whole-tree invalidation.
 *
 * Constraints: async fs only, no `node:` specifiers, no `process` references —
 * pure I/O over paths the caller supplies.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { createHash } from "crypto";

export const CACHE_VERSION = 2;

/**
 * Default staleness horizon for cache entries: an entry whose mtime is older
 * than this is pruned. Content keys are append-only — every source edit mints a
 * new key and orphans the old entry forever — so without eviction the cache
 * grows unbounded. 14 days comfortably outlives a normal rebase/CI cadence.
 */
export const CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Resolve the shared cache directory from a repo root, or null if it isn't a
 * git checkout. `<root>/.git` is a directory in the main checkout and a
 * `gitdir: <path>` pointer file in a linked worktree; the git COMMON dir
 * (`.../<repo>/.git`) is shared by all of them, so we anchor the cache there.
 */
export async function sharedCacheDir(rootDir: string): Promise<string | null> {
  const dotGit = path.join(rootDir, ".git");
  let stat;
  try {
    stat = await fs.stat(dotGit);
  } catch {
    return null;
  }
  let commonDir: string;
  if (stat.isDirectory()) {
    commonDir = dotGit;
  } else {
    const pointer = await fs.readFile(dotGit, "utf-8");
    const match = pointer.match(/^gitdir:\s*(.+)$/m);
    if (!match) return null;
    // `<repo>/.git/worktrees/<name>` → up two levels is `<repo>/.git`.
    const gitdir = path.resolve(rootDir, match[1].trim());
    commonDir = path.dirname(path.dirname(gitdir));
  }
  return path.join(commonDir, "api-compare-cache", `v${CACHE_VERSION}`);
}

/** sha1 over NUL-delimited parts (delimiter prevents boundary ambiguity). */
export function hashParts(parts: string[]): string {
  const hash = createHash("sha1");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Content fingerprint of `files`: sha1 over sorted `relPath\tsha1(content)`
 * lines. Sorting makes it order-independent; the path makes it rename/move
 * sensitive; hashing CONTENT (not mtime/size) makes it stable across checkouts
 * so the cache actually hits cross-worktree.
 */
export async function contentFingerprint(files: string[], baseDir: string): Promise<string> {
  const lines = await Promise.all(
    files.map(async (file) => {
      const buf = await fs.readFile(file);
      const rel = path.relative(baseDir, file).replace(/\\/g, "/");
      return `${rel}\t${createHash("sha1").update(buf).digest("hex")}`;
    }),
  );
  lines.sort();
  return hashParts(lines);
}

/** sha1 of one file's contents, or null if it doesn't exist. */
export async function fileHash(file: string): Promise<string | null> {
  try {
    return createHash("sha1")
      .update(await fs.readFile(file))
      .digest("hex");
  } catch {
    return null;
  }
}

/**
 * The RESOLVED READ-SET of one extraction: repo-relative POSIX path → sha1 of
 * the file's contents at extraction time.
 *
 * The TS extractor compiles a package with the real module resolver, so an
 * `import { htmlEscapeOnce } from "@blazetrails/activesupport"` pulls the
 * DECLARING file out of a sibling package, and the extracted surface for the
 * importer depends on that sibling. A cache key built from the package's OWN
 * files alone therefore survives an edit that changes its extraction — which is
 * exactly how a cached run and an `API_COMPARE_FORCE=1` run came to disagree.
 *
 * Widening the key with each dependency PACKAGE's fingerprint fixes that but is
 * far too coarse: one line appended to an activesupport core-ext invalidates 12
 * of 13 packages, nearly all of which never resolve that file. `ts.Program`
 * already knows the truth — `program.getSourceFiles()` enumerates exactly what
 * the compiler read — so we record those paths' hashes in the cache entry and
 * serve the entry only while every one of them still hashes the same. The
 * read-set is known only AFTER an extraction, hence entries carry their own
 * input list (a first run on a package still extracts).
 */
export type ReadSet = Record<string, string>;

export interface ResolutionShape {
  keyFor(dirName: string): string;
}

export async function resolutionShape(packagesDir: string): Promise<ResolutionShape> {
  let dirs: string[];
  try {
    dirs = await fs.readdir(packagesDir);
  } catch {
    dirs = [];
  }
  const names = new Map<string, string[]>();
  await Promise.all(
    dirs.map(async (dir) => {
      const dist = path.join(packagesDir, dir, "dist");
      const files = await declarationsUnder(dist);
      names.set(
        dir,
        files.map((file) => `${dir}/${path.relative(dist, file).replace(/\\/g, "/")}`),
      );
    }),
  );
  const graph = await readWorkspaceGraph(packagesDir, dirs);
  const globalKey = hashParts([...names.values()].flat().sort());
  const keys = new Map<string, string>();
  for (const dir of graph.keys()) {
    const closure = transitiveDeps(graph, dir);
    keys.set(dir, hashParts(closure.flatMap((dep) => names.get(dep) ?? []).sort()));
  }
  return { keyFor: (dirName) => keys.get(dirName) ?? globalKey };
}

async function readWorkspaceGraph(
  packagesDir: string,
  dirs: string[],
): Promise<Map<string, string[]>> {
  const manifests = await Promise.all(dirs.map(async (dir) => readManifest(packagesDir, dir)));
  const dirOfName = new Map<string, string>();
  for (const manifest of manifests) {
    if (manifest) dirOfName.set(manifest.name, manifest.dir);
  }
  const graph = new Map<string, string[]>();
  for (const manifest of manifests) {
    if (!manifest) continue;
    const deps = manifest.deps
      .map((dep) => dirOfName.get(dep))
      .filter((dir): dir is string => dir !== undefined && dir !== manifest.dir);
    graph.set(manifest.dir, [...new Set(deps)]);
  }
  return graph;
}

interface PackageManifest {
  dir: string;
  name: string;
  deps: string[];
}

async function readManifest(packagesDir: string, dir: string): Promise<PackageManifest | null> {
  let json: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  try {
    json = JSON.parse(await fs.readFile(path.join(packagesDir, dir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
  if (typeof json.name !== "string" || json.name.length === 0) return null;
  const declared = Object.keys({
    ...json.dependencies,
    ...json.devDependencies,
    ...json.peerDependencies,
    ...json.optionalDependencies,
  });
  return { dir, name: json.name, deps: [...declared, ...(await linkedPackages(packagesDir, dir))] };
}

async function linkedPackages(packagesDir: string, dir: string): Promise<string[]> {
  const scopesDir = path.join(packagesDir, dir, "node_modules");
  let scopes: string[];
  try {
    scopes = (await fs.readdir(scopesDir, { withFileTypes: true }))
      .filter((entry) => entry.name.startsWith("@"))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const nested = await Promise.all(
    scopes.map(async (scope) => {
      try {
        const members = await fs.readdir(path.join(scopesDir, scope));
        return members.map((member) => `${scope}/${member}`);
      } catch {
        return [];
      }
    }),
  );
  return nested.flat();
}

function transitiveDeps(graph: Map<string, string[]>, dir: string): string[] {
  const seen = new Set<string>([dir]);
  const queue = [dir];
  while (queue.length > 0) {
    const next = queue.pop();
    if (next === undefined) break;
    for (const dep of graph.get(next) ?? []) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  return [...seen];
}

/**
 * Hash of the workspace's THIRD-PARTY declaration state: the content of
 * `pnpm-lock.yaml`.
 *
 * Neither of the other two keys can see `node_modules`: `normalizeReadSet`
 * drops every path under it and `resolutionShape` only walks
 * `packages/*\/dist`. Yet most of what the compiler reads is third-party — on
 * actionview, 197 of 241 resolved files (`@types/node`, `typescript`'s
 * `lib.*.d.ts`, `undici-types`, `@types/pg`) — so a dependency bump changes the
 * extracted surface with every cache entry still valid.
 *
 * Keeping those paths in the read-set would be precise but costs ~23 ms per
 * warm run (228 unique third-party files hashed, memoised across the 13
 * packages) plus a `realpath` and a cache-entry line for each of ~200 paths per
 * package; the lockfile is one 400 KB read, ~2 ms per run, once. Third-party
 * declarations only move on an install, and an install rewrites the lockfile,
 * so the coarse key catches every real case at a tenth of the cost. Returns a
 * sentinel when there is no lockfile so a lockfile-less tree still keys stably.
 */
export async function dependencyKey(rootDir: string): Promise<string> {
  const hash = await fileHash(path.join(rootDir, "pnpm-lock.yaml"));
  return hashParts([hash ?? "no-lockfile"]);
}

async function declarationsUnder(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return declarationsUnder(full);
      return entry.name.endsWith(".d.ts") ? [full] : [];
    }),
  );
  return nested.flat();
}

/**
 * Reduce raw `program.getSourceFiles()` file names to the repo-relative paths
 * worth validating: real paths (pnpm resolves `@blazetrails/<dep>` through a
 * `node_modules` symlink into `packages/<dep>/dist`, and the symlinked spelling
 * would be an unstable key), inside `rootDir`, and outside `node_modules` —
 * third-party declarations are covered instead by `dependencyKey`. `exclude`
 * drops paths already covered by the caller's own fingerprint, so the recorded
 * set is the CROSS-package remainder.
 */
export async function normalizeReadSet(
  fileNames: string[],
  rootDir: string,
  exclude: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const prefix = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  const resolved = await Promise.all(
    fileNames.map(async (file) => {
      try {
        return await fs.realpath(file);
      } catch {
        return file;
      }
    }),
  );
  const rels = new Set<string>();
  for (const file of resolved) {
    if (!file.startsWith(prefix)) continue;
    const rel = path.relative(rootDir, file).replace(/\\/g, "/");
    if (rel.split("/").includes("node_modules")) continue;
    if (exclude.has(rel)) continue;
    rels.add(rel);
  }
  return [...rels].sort();
}

/**
 * Hash every path of a read-set. Missing files are omitted — a path that can't
 * be read now was not one of the inputs that produced the entry, and recording
 * a placeholder would make the entry permanently unservable.
 */
export async function hashReadSet(
  relPaths: string[],
  rootDir: string,
  cache?: Map<string, Promise<string | null>>,
): Promise<ReadSet> {
  const hashes = await Promise.all(relPaths.map((rel) => hashOf(path.join(rootDir, rel), cache)));
  const readSet: ReadSet = {};
  relPaths.forEach((rel, i) => {
    const hash = hashes[i];
    if (hash !== null) readSet[rel] = hash;
  });
  return readSet;
}

/**
 * Whether every recorded input still hashes to the value it had when the entry
 * was written. A vanished file fails (its hash is null), which is right: the
 * compiler would resolve something else now.
 */
export async function readSetMatches(
  recorded: ReadSet,
  rootDir: string,
  cache?: Map<string, Promise<string | null>>,
): Promise<boolean> {
  const entries = Object.entries(recorded);
  const current = await Promise.all(entries.map(([rel]) => hashOf(path.join(rootDir, rel), cache)));
  return entries.every(([, hash], i) => current[i] === hash);
}

/** `fileHash` memoised per absolute path across the packages of one run. */
function hashOf(file: string, cache?: Map<string, Promise<string | null>>): Promise<string | null> {
  if (!cache) return fileHash(file);
  let pending = cache.get(file);
  if (!pending) {
    pending = fileHash(file);
    cache.set(file, pending);
  }
  return pending;
}

function entryPath(dir: string, name: string, key: string): string {
  return path.join(dir, `${name}-${key}.json`);
}

/** Outcome of a prune pass — counts so callers can log what was reclaimed. */
export interface PruneResult {
  /** Stale `<name>-<key>.json` entry files removed from the current-version dir. */
  removedEntries: number;
  /** Stale crashed-writer `.tmp-` fragments removed from the current-version dir. */
  removedFragments: number;
  /** Superseded `v<N>` (N < CACHE_VERSION) sibling directories removed wholesale. */
  removedVersionDirs: number;
}

/**
 * Evict from the shared cache anchored at `rootDir`:
 *
 *   1. Entry files (and crashed-writer `.tmp-` fragments) in the current
 *      `v${CACHE_VERSION}` dir whose mtime is older than `maxAgeMs` — orphaned
 *      content keys and partial writes (see CACHE_MAX_AGE_MS).
 *   2. Sibling `v<N>` directories left behind by a SUPERSEDED CACHE_VERSION,
 *      i.e. only N < CACHE_VERSION. Higher-numbered dirs belong to a newer code
 *      version that may be running concurrently (a bisect or mixed-version
 *      parallel run); wiping those would mutually destroy the live cache, so we
 *      leave them strictly alone.
 *
 * `now` is injected (defaulting to the wall clock) so tests pin the horizon
 * without touching the entries' real mtimes. Entirely best-effort: a missing or
 * unreadable cache is a no-op, and per-file/dir failures are swallowed — the
 * cache is an optimisation and pruning must never break a run.
 */
export async function pruneSharedCache(
  rootDir: string,
  opts: { now?: number; maxAgeMs?: number } = {},
): Promise<PruneResult> {
  const result: PruneResult = { removedEntries: 0, removedFragments: 0, removedVersionDirs: 0 };
  const currentDir = await sharedCacheDir(rootDir);
  if (!currentDir) return result;
  const parent = path.dirname(currentDir);
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? CACHE_MAX_AGE_MS;

  let siblings: string[];
  try {
    siblings = await fs.readdir(parent);
  } catch {
    return result;
  }
  for (const name of siblings) {
    const match = name.match(/^v(\d+)$/);
    if (!match || Number(match[1]) >= CACHE_VERSION) continue;
    try {
      await fs.rm(path.join(parent, name), { recursive: true, force: true });
      result.removedVersionDirs++;
    } catch {
      // best-effort
    }
  }

  let entries: string[];
  try {
    entries = await fs.readdir(currentDir);
  } catch {
    return result;
  }
  await Promise.all(
    entries.map(async (name) => {
      // Entries (`<name>-<key>.json`) and tmp fragments left by a crashed or
      // raced writeShared (`<entry>.tmp-<tag>`) — both age out; nothing else
      // should live here, but anything that isn't one of those is left alone.
      const isFragment = name.includes(".tmp-");
      if (!name.endsWith(".json") && !isFragment) return;
      const file = path.join(currentDir, name);
      try {
        const stat = await fs.stat(file);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(file, { force: true });
          if (isFragment) result.removedFragments++;
          else result.removedEntries++;
        }
      } catch {
        // best-effort
      }
    }),
  );

  return result;
}

/**
 * Read a cached entry body, or null on miss / unreadable cache. On a hit we
 * bump the entry's mtime to now so `pruneSharedCache` evicts by LAST ACCESS,
 * not last write: a stable source file's key never changes, so without this its
 * entry — read every run — would still age out at maxAgeMs and be needlessly
 * regenerated. The touch is awaited (one cheap syscall) so callers and tests
 * observe the new mtime deterministically; a touch failure (e.g. read-only FS)
 * is swallowed since the body is already in hand.
 */
export async function readShared(dir: string, name: string, key: string): Promise<string | null> {
  const file = entryPath(dir, name, key);
  let body: string;
  try {
    body = await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
  const stamp = new Date();
  await fs.utimes(file, stamp, stamp).catch(() => {});
  return body;
}

/**
 * Write a cache entry atomically (tmp + rename). `tag` discriminates the tmp
 * file per writer so worktrees racing on the same key don't clobber each
 * other's partial write (final contents are identical regardless of who lands
 * last). Failures are swallowed: the cache is an optimisation, never required.
 */
export async function writeShared(
  dir: string,
  name: string,
  key: string,
  body: string,
  tag: string,
): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
    const final = entryPath(dir, name, key);
    const safeTag = tag.replace(/[^A-Za-z0-9_.-]/g, "_");
    const tmp = `${final}.tmp-${safeTag}`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, final);
  } catch {
    // best-effort
  }
}
