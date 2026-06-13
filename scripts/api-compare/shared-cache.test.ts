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

describe("readShared / writeShared", () => {
  it("round-trips an entry, misses cleanly, and leaves no tmp file", async () => {
    const dir = path.join(mkTmp(), "cache");
    expect(await readShared(dir, "ts-arel", "key1")).toBeNull();
    await writeShared(dir, "ts-arel", "key1", '{"v":1}', "worktree/a");
    expect(await readShared(dir, "ts-arel", "key1")).toBe('{"v":1}');
    expect(fs.readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
  });
});
