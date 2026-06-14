/**
 * Tests for the cross-worktree shared cache helpers: content-keying
 * (mtime-independent, so hits survive across checkouts), git-common-dir
 * resolution for a main checkout and a linked worktree, and the read/write
 * round-trip.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  sharedCacheDir,
  contentFingerprint,
  hashParts,
  fileHash,
  readShared,
  writeShared,
  pruneSharedCache,
  CACHE_VERSION,
} from "./shared-cache.js";

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-cache-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("sharedCacheDir", () => {
  it("anchors at <root>/.git when .git is a directory (main checkout)", async () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, ".git"));
    expect(await sharedCacheDir(root)).toBe(
      path.join(root, ".git", "api-compare-cache", `v${CACHE_VERSION}`),
    );
  });

  it("resolves the git common dir from a worktree .git pointer file", async () => {
    const repo = mkTmp();
    const worktreeGit = path.join(repo, ".git", "worktrees", "feature-x");
    fs.mkdirSync(worktreeGit, { recursive: true });
    const worktree = mkTmp();
    fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeGit}\n`);
    expect(await sharedCacheDir(worktree)).toBe(
      path.join(repo, ".git", "api-compare-cache", `v${CACHE_VERSION}`),
    );
  });

  it("returns null when there is no .git", async () => {
    expect(await sharedCacheDir(mkTmp())).toBeNull();
  });
});

describe("contentFingerprint", () => {
  it("is stable across mtime changes but tracks content and renames", async () => {
    const a = mkTmp();
    const b = mkTmp();
    fs.writeFileSync(path.join(a, "x.ts"), "export const x = 1;");
    fs.writeFileSync(path.join(b, "x.ts"), "export const x = 1;");
    fs.utimesSync(path.join(b, "x.ts"), new Date(0), new Date(0));
    const fa = await contentFingerprint([path.join(a, "x.ts")], a);
    expect(await contentFingerprint([path.join(b, "x.ts")], b)).toBe(fa);

    fs.writeFileSync(path.join(a, "x.ts"), "export const x = 2;");
    expect(await contentFingerprint([path.join(a, "x.ts")], a)).not.toBe(fa);

    fs.writeFileSync(path.join(a, "x.ts"), "export const x = 1;");
    fs.renameSync(path.join(a, "x.ts"), path.join(a, "y.ts"));
    expect(await contentFingerprint([path.join(a, "y.ts")], a)).not.toBe(fa);
  });

  it("is order-independent", async () => {
    const dir = mkTmp();
    fs.writeFileSync(path.join(dir, "a.ts"), "1");
    fs.writeFileSync(path.join(dir, "b.ts"), "2");
    const ab = [path.join(dir, "a.ts"), path.join(dir, "b.ts")];
    expect(await contentFingerprint(ab, dir)).toBe(await contentFingerprint([ab[1], ab[0]], dir));
  });
});

describe("hashParts / fileHash", () => {
  it("delimits parts so concatenation collisions don't occur", () => {
    expect(hashParts(["ab", "c"])).not.toBe(hashParts(["a", "bc"]));
  });
  it("hashes file contents and returns null for a missing file", async () => {
    const dir = mkTmp();
    fs.writeFileSync(path.join(dir, "f"), "hello");
    expect(await fileHash(path.join(dir, "f"))).toMatch(/^[0-9a-f]{40}$/);
    expect(await fileHash(path.join(dir, "nope"))).toBeNull();
  });
});

describe("pruneSharedCache", () => {
  const DAY = 24 * 60 * 60 * 1000;

  function mkRoot(): string {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, ".git"));
    return root;
  }
  function cacheParent(root: string): string {
    return path.join(root, ".git", "api-compare-cache");
  }
  function currentDir(root: string): string {
    return path.join(cacheParent(root), `v${CACHE_VERSION}`);
  }

  it("no-ops cleanly when there is no cache or no .git", async () => {
    expect(await pruneSharedCache(mkTmp())).toEqual({
      removedEntries: 0,
      removedVersionDirs: 0,
    });
    const root = mkRoot();
    expect(await pruneSharedCache(root)).toEqual({
      removedEntries: 0,
      removedVersionDirs: 0,
    });
  });

  it("removes entries older than maxAgeMs and keeps fresh ones", async () => {
    const root = mkRoot();
    const dir = currentDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const now = 100 * DAY;
    const stale = path.join(dir, "rails-api-old.json");
    const fresh = path.join(dir, "rails-api-new.json");
    fs.writeFileSync(stale, "{}");
    fs.writeFileSync(fresh, "{}");
    fs.utimesSync(stale, new Date(now - 30 * DAY), new Date(now - 30 * DAY));
    fs.utimesSync(fresh, new Date(now - 1 * DAY), new Date(now - 1 * DAY));

    const result = await pruneSharedCache(root, { now, maxAgeMs: 14 * DAY });
    expect(result).toEqual({ removedEntries: 1, removedVersionDirs: 0 });
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("ignores non-.json files and only evicts by mtime", async () => {
    const root = mkRoot();
    const dir = currentDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const now = 100 * DAY;
    const other = path.join(dir, "rails-api-old.json.tmp-worktree_a");
    fs.writeFileSync(other, "partial");
    fs.utimesSync(other, new Date(now - 30 * DAY), new Date(now - 30 * DAY));

    const result = await pruneSharedCache(root, { now, maxAgeMs: 14 * DAY });
    expect(result.removedEntries).toBe(0);
    expect(fs.existsSync(other)).toBe(true);
  });

  it("removes superseded version dirs but never the current one", async () => {
    const root = mkRoot();
    fs.mkdirSync(currentDir(root), { recursive: true });
    const parent = cacheParent(root);
    fs.mkdirSync(path.join(parent, `v${CACHE_VERSION + 1}`));
    fs.mkdirSync(path.join(parent, "v0"));
    fs.mkdirSync(path.join(parent, "scratch")); // non-version dir, untouched

    const result = await pruneSharedCache(root, { now: 0, maxAgeMs: DAY });
    expect(result.removedVersionDirs).toBe(2);
    expect(fs.existsSync(currentDir(root))).toBe(true);
    expect(fs.existsSync(path.join(parent, "v0"))).toBe(false);
    expect(fs.existsSync(path.join(parent, `v${CACHE_VERSION + 1}`))).toBe(false);
    expect(fs.existsSync(path.join(parent, "scratch"))).toBe(true);
  });
});

describe("readShared / writeShared", () => {
  it("round-trips an entry, misses cleanly, and leaves no tmp file", async () => {
    const dir = path.join(mkTmp(), "cache");
    expect(await readShared(dir, "ts-arel", "key1")).toBeNull();
    await writeShared(dir, "ts-arel", "key1", '{"v":1}', "worktree/a");
    expect(await readShared(dir, "ts-arel", "key1")).toBe('{"v":1}');
    expect(fs.readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });
});
