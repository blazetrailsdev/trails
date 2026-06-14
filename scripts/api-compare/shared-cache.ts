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

export const CACHE_VERSION = 1;

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
