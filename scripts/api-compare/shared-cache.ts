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

/** Read a cached entry body, or null on miss / unreadable cache. */
export async function readShared(dir: string, name: string, key: string): Promise<string | null> {
  try {
    return await fs.readFile(entryPath(dir, name, key), "utf-8");
  } catch {
    return null;
  }
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
