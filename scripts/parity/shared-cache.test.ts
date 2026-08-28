/**
 * Tests for the cross-worktree shared cache helpers: content-keying
 * (mtime-independent, so hits survive across checkouts), git-common-dir
 * resolution for a main checkout and a linked worktree, the read/write
 * round-trip, and read-set validation (an entry is served only while every
 * input its extraction actually resolved still hashes the same).
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { foreignManifestMessage } from "../api-compare/extract-ts-api.js";
import {
  foreignAbsolutePath,
  readSharedFor,
  publishShared,
  sharedCacheDir,
  contentFingerprint,
  hashParts,
  fileHash,
  readShared,
  writeShared,
  pruneSharedCache,
  normalizeReadSet,
  hashReadSet,
  readSetMatches,
  resolutionShape,
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
      path.join(root, ".git", "parity-cache", `v${CACHE_VERSION}`),
    );
  });

  it("resolves the git common dir from a worktree .git pointer file", async () => {
    const repo = mkTmp();
    const worktreeGit = path.join(repo, ".git", "worktrees", "feature-x");
    fs.mkdirSync(worktreeGit, { recursive: true });
    const worktree = mkTmp();
    fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${worktreeGit}\n`);
    expect(await sharedCacheDir(worktree)).toBe(
      path.join(repo, ".git", "parity-cache", `v${CACHE_VERSION}`),
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
    return path.join(root, ".git", "parity-cache");
  }
  function currentDir(root: string): string {
    return path.join(cacheParent(root), `v${CACHE_VERSION}`);
  }

  const EMPTY = {
    removedEntries: 0,
    removedFragments: 0,
    removedVersionDirs: 0,
    removedLegacyDir: false,
  };

  it("no-ops cleanly when there is no cache or no .git", async () => {
    expect(await pruneSharedCache(mkTmp())).toEqual(EMPTY);
    const root = mkRoot();
    expect(await pruneSharedCache(root)).toEqual(EMPTY);
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
    expect(result).toEqual({ ...EMPTY, removedEntries: 1 });
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it("evicts stale crashed-writer .tmp- fragments but leaves unrelated files", async () => {
    const root = mkRoot();
    const dir = currentDir(root);
    fs.mkdirSync(dir, { recursive: true });
    const now = 100 * DAY;
    const staleTmp = path.join(dir, "rails-api-old.json.tmp-worktree_a");
    const unrelated = path.join(dir, "README");
    fs.writeFileSync(staleTmp, "partial");
    fs.writeFileSync(unrelated, "note");
    fs.utimesSync(staleTmp, new Date(now - 30 * DAY), new Date(now - 30 * DAY));
    fs.utimesSync(unrelated, new Date(now - 30 * DAY), new Date(now - 30 * DAY));

    const result = await pruneSharedCache(root, { now, maxAgeMs: 14 * DAY });
    expect(result.removedFragments).toBe(1);
    expect(result.removedEntries).toBe(0);
    expect(fs.existsSync(staleTmp)).toBe(false);
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it("removes the superseded pre-rename api-compare-cache tree", async () => {
    const root = mkRoot();
    fs.mkdirSync(currentDir(root), { recursive: true });
    const legacy = path.join(root, ".git", "api-compare-cache", "v2");
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "rails-api-abc.json"), "{}");

    const result = await pruneSharedCache(root, { now: 0, maxAgeMs: DAY });
    expect(result.removedLegacyDir).toBe(true);
    expect(fs.existsSync(path.join(root, ".git", "api-compare-cache"))).toBe(false);
    expect(fs.existsSync(currentDir(root))).toBe(true);
  });

  it("removes superseded version dirs but never the current or a newer one", async () => {
    const root = mkRoot();
    fs.mkdirSync(currentDir(root), { recursive: true });
    const parent = cacheParent(root);
    const newer = path.join(parent, `v${CACHE_VERSION + 1}`);
    fs.mkdirSync(newer); // a concurrent newer-version run — must NOT be wiped
    fs.mkdirSync(path.join(parent, "v0"));
    fs.mkdirSync(path.join(parent, "scratch")); // non-version dir, untouched

    const result = await pruneSharedCache(root, { now: 0, maxAgeMs: DAY });
    expect(result.removedVersionDirs).toBe(1);
    expect(fs.existsSync(currentDir(root))).toBe(true);
    expect(fs.existsSync(path.join(parent, "v0"))).toBe(false);
    expect(fs.existsSync(newer)).toBe(true);
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

  it("bumps mtime on a hit so prune evicts by last access, not last write", async () => {
    const dir = path.join(mkTmp(), "cache");
    await writeShared(dir, "ts-arel", "key1", '{"v":1}', "worktree/a");
    const file = path.join(dir, "ts-arel-key1.json");
    fs.utimesSync(file, new Date(0), new Date(0)); // age the entry to the epoch
    expect((await fs.promises.stat(file)).mtimeMs).toBe(0);

    expect(await readShared(dir, "ts-arel", "key1")).toBe('{"v":1}');
    // readShared awaits its own touch, so the new mtime is observable immediately.
    expect((await fs.promises.stat(file)).mtimeMs).toBeGreaterThan(0);
  });
});

describe("resolved read-set", () => {
  it("keeps repo files, drops node_modules, symlinks, and own inputs", async () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, "packages", "activesupport", "dist"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "actionview", "src"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages", "actionview", "node_modules", "@blazetrails"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "node_modules", "typescript"), { recursive: true });
    const dist = path.join(root, "packages", "activesupport", "dist", "index.d.ts");
    fs.writeFileSync(dist, "export declare const a: number;");
    fs.writeFileSync(path.join(root, "packages", "actionview", "src", "own.ts"), "");
    fs.writeFileSync(path.join(root, "node_modules", "typescript", "lib.d.ts"), "");
    fs.symlinkSync(
      path.join(root, "packages", "activesupport"),
      path.join(root, "packages", "actionview", "node_modules", "@blazetrails", "activesupport"),
    );
    const outside = path.join(mkTmp(), "elsewhere.ts");
    fs.writeFileSync(outside, "");

    const readSet = await normalizeReadSet(
      [
        // resolved through the pnpm workspace symlink — recorded by real path
        path.join(
          root,
          "packages/actionview/node_modules/@blazetrails/activesupport/dist/index.d.ts",
        ),
        path.join(root, "packages/actionview/src/own.ts"),
        path.join(root, "node_modules/typescript/lib.d.ts"),
        outside,
      ],
      root,
      new Set(["packages/actionview/src/own.ts"]),
    );
    expect(readSet).toEqual(["packages/activesupport/dist/index.d.ts"]);
  });

  it("serves an entry only while every recorded input hashes the same", async () => {
    const root = mkTmp();
    fs.mkdirSync(path.join(root, "pkg"));
    const read = path.join(root, "pkg", "read.ts");
    const unread = path.join(root, "pkg", "unread.ts");
    fs.writeFileSync(read, "export const a = 1;");
    fs.writeFileSync(unread, "export const b = 1;");
    const recorded = await hashReadSet(["pkg/read.ts"], root);
    expect(await readSetMatches(recorded, root)).toBe(true);

    // The output-safety case: editing a file this package never resolved must
    // NOT invalidate its entry.
    fs.writeFileSync(unread, "export const b = 2;");
    expect(await readSetMatches(recorded, root)).toBe(true);

    fs.writeFileSync(read, "export const a = 2;");
    expect(await readSetMatches(recorded, root)).toBe(false);
  });

  it("invalidates when a recorded input disappears", async () => {
    const root = mkTmp();
    fs.writeFileSync(path.join(root, "dep.d.ts"), "declare const a: number;");
    const recorded = await hashReadSet(["dep.d.ts"], root);
    fs.rmSync(path.join(root, "dep.d.ts"));
    expect(await readSetMatches(recorded, root)).toBe(false);
  });

  it("omits inputs that no longer exist and hashes through the memo cache", async () => {
    const root = mkTmp();
    fs.writeFileSync(path.join(root, "here.ts"), "x");
    const cache = new Map<string, Promise<string | null>>();
    const recorded = await hashReadSet(["here.ts", "gone.ts"], root, cache);
    expect(Object.keys(recorded)).toEqual(["here.ts"]);
    expect(cache.size).toBe(2);
    // A cached hash is reused even after the file changes underneath — the memo
    // is per-run, which is what keeps one run's view of the tree consistent.
    fs.writeFileSync(path.join(root, "here.ts"), "y");
    expect(await readSetMatches(recorded, root, cache)).toBe(true);
    expect(await readSetMatches(recorded, root)).toBe(false);
  });
});

describe("resolutionShape", () => {
  function writeDist(packagesDir: string, dir: string, files: Record<string, string>): void {
    for (const [name, body] of Object.entries(files)) {
      const file = path.join(packagesDir, dir, "dist", name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
    }
  }

  function writeManifest(packagesDir: string, dir: string, deps: string[]): void {
    fs.mkdirSync(path.join(packagesDir, dir), { recursive: true });
    fs.writeFileSync(
      path.join(packagesDir, dir, "package.json"),
      JSON.stringify({
        name: `@blazetrails/${dir}`,
        dependencies: Object.fromEntries(deps.map((dep) => [`@blazetrails/${dep}`, "workspace:*"])),
      }),
    );
  }

  async function keyOf(packagesDir: string, dir: string): Promise<string> {
    return (await resolutionShape(packagesDir)).keyFor(dir);
  }

  it("tracks which declarations exist, not what they say", async () => {
    const packagesDir = mkTmp();
    writeDist(packagesDir, "activesupport", { "index.d.ts": "export declare const a: number;" });
    const built = await keyOf(packagesDir, "activesupport");

    writeDist(packagesDir, "activesupport", { "index.d.ts": "export declare const a: string;" });
    expect(await keyOf(packagesDir, "activesupport")).toBe(built);

    const unbuilt = mkTmp();
    fs.mkdirSync(path.join(unbuilt, "activesupport"), { recursive: true });
    expect(await keyOf(unbuilt, "activesupport")).not.toBe(built);

    writeDist(packagesDir, "activesupport", { "extra.d.ts": "export declare const b: number;" });
    expect(await keyOf(packagesDir, "activesupport")).not.toBe(built);
  });

  it("ignores non-declaration output and a missing packages dir", async () => {
    const packagesDir = mkTmp();
    writeDist(packagesDir, "arel", { "index.d.ts": "" });
    const before = await keyOf(packagesDir, "arel");
    writeDist(packagesDir, "arel", { "index.js": "", "nested/index.js.map": "" });
    expect(await keyOf(packagesDir, "arel")).toBe(before);
    expect(await keyOf(path.join(packagesDir, "nope"), "arel")).toMatch(/^[0-9a-f]{40}$/);
  });

  it("keys each package over its own transitive dependencies only", async () => {
    const packagesDir = mkTmp();
    for (const [dir, deps] of [
      ["activesupport", []],
      ["arel", ["activesupport"]],
      ["activerecord", ["arel"]],
      ["actionview", []],
    ] as [string, string[]][]) {
      writeManifest(packagesDir, dir, deps);
      writeDist(packagesDir, dir, { "index.d.ts": "" });
    }
    const before = await resolutionShape(packagesDir);
    const keys = ["activesupport", "arel", "activerecord", "actionview"].map((dir) =>
      before.keyFor(dir),
    );

    writeDist(packagesDir, "actionview", { "extra.d.ts": "" });
    const after = await resolutionShape(packagesDir);
    expect(["activesupport", "arel", "activerecord"].map((dir) => after.keyFor(dir))).toEqual(
      keys.slice(0, 3),
    );
    expect(after.keyFor("actionview")).not.toBe(keys[3]);

    writeDist(packagesDir, "activesupport", { "extra.d.ts": "" });
    const later = await resolutionShape(packagesDir);
    expect(later.keyFor("activerecord")).not.toBe(keys[2]);
    expect(later.keyFor("arel")).not.toBe(keys[1]);
    expect(later.keyFor("actionview")).toBe(after.keyFor("actionview"));
  });

  it("falls back to the workspace-global key for an unknown package dir", async () => {
    const packagesDir = mkTmp();
    writeManifest(packagesDir, "arel", []);
    writeDist(packagesDir, "arel", { "index.d.ts": "" });
    writeDist(packagesDir, "actionview", { "index.d.ts": "" });

    const before = await resolutionShape(packagesDir);
    writeDist(packagesDir, "arel", { "extra.d.ts": "" });
    expect((await resolutionShape(packagesDir)).keyFor("actionview")).not.toBe(
      before.keyFor("actionview"),
    );
  });

  it("follows a workspace link that the manifest does not declare", async () => {
    const packagesDir = mkTmp();
    writeManifest(packagesDir, "arel", []);
    writeManifest(packagesDir, "activesupport", []);
    writeDist(packagesDir, "arel", { "index.d.ts": "" });
    writeDist(packagesDir, "activesupport", { "index.d.ts": "" });
    fs.mkdirSync(path.join(packagesDir, "arel", "node_modules", "@blazetrails"), {
      recursive: true,
    });
    fs.symlinkSync(
      path.join(packagesDir, "activesupport"),
      path.join(packagesDir, "arel", "node_modules", "@blazetrails", "activesupport"),
    );

    const before = await resolutionShape(packagesDir);
    writeDist(packagesDir, "activesupport", { "extra.d.ts": "" });
    const after = await resolutionShape(packagesDir);
    expect(after.keyFor("arel")).not.toBe(before.keyFor("arel"));
    expect(after.keyFor("activesupport")).not.toBe(before.keyFor("activesupport"));
  });

  it("terminates on a dependency cycle", async () => {
    const packagesDir = mkTmp();
    writeManifest(packagesDir, "arel", ["activesupport"]);
    writeManifest(packagesDir, "activesupport", ["arel"]);
    writeDist(packagesDir, "arel", { "index.d.ts": "" });
    writeDist(packagesDir, "activesupport", { "index.d.ts": "" });
    const shape = await resolutionShape(packagesDir);
    expect(shape.keyFor("arel")).toBe(shape.keyFor("activesupport"));
  });
});

describe("foreignAbsolutePath", () => {
  const root = "/mnt/theta/trails/worktrees/mine";

  it("returns null for a worktree-independent payload", () => {
    const body = JSON.stringify({
      classes: { "base.ts:Base": { extends: ["Querying"], file: "base.ts" } },
      inputs: { "packages/activerecord/src/base.ts": "abc" },
    });
    expect(foreignAbsolutePath(body, root)).toBeNull();
  });

  it("flags a path belonging to another worktree", () => {
    const body = JSON.stringify({
      classes: {
        "base.ts:Base": {
          extends: ['"/mnt/theta/trails/worktrees/other/packages/activerecord/src/querying"'],
        },
      },
    });
    expect(foreignAbsolutePath(body, root)).toBe(
      "/mnt/theta/trails/worktrees/other/packages/activerecord/src/querying",
    );
  });

  it("accepts an absolute path inside the invoking worktree", () => {
    const body = JSON.stringify({ note: `${root}/packages/arel/src/crud.ts` });
    expect(foreignAbsolutePath(body, root)).toBeNull();
  });

  it("ignores an absolute-looking token in prose", () => {
    const body = JSON.stringify({ doc: "See //guides.rubyonrails.org/routing.html." });
    expect(foreignAbsolutePath(body, root)).toBeNull();
  });
});

/**
 * The cross-worktree replay itself (RFC 0126), through the code path
 * `extract-ts-api.ts` runs: prime the shared cache from worktree A, then serve
 * worktree B and assert B's manifest is B's own — never A's.
 *
 * A and B are two linked worktrees of ONE repo, so `sharedCacheDir` resolves
 * them to the same directory and A's entry is genuinely reachable from B. The
 * payloads are the real shape the bug produced: a `ClassInfo.extends` entry
 * carrying TypeScript's quoted absolute path for a namespace-imported module.
 *
 * The one thing this cannot do is BE a second checkout: `main()` resolves its
 * root from the script's location, so running the real binary under B needs a
 * second checkout plus a built `dist` for every package — a CI-scale run, not a
 * unit test. Every root-dependent decision that run would make is exercised
 * here: `readSharedFor` / `publishShared` are the calls `main()` makes.
 */
describe("a cache entry cannot supply another worktree's paths", () => {
  const NAME = "ts-activerecord";
  const KEY = "schema1-contentkey";

  function linkedWorktrees(): { a: string; b: string } {
    const repo = mkTmp();
    const [a, b] = ["a", "b"].map((name) => {
      const gitdir = path.join(repo, ".git", "worktrees", name);
      fs.mkdirSync(gitdir, { recursive: true });
      const root = mkTmp();
      fs.writeFileSync(path.join(root, ".git"), `gitdir: ${gitdir}\n`);
      return root;
    });
    return { a, b };
  }

  /** A package manifest as the extractor caches it, `extends` spelled as given. */
  const manifestOf = (root: string, extendsName: string) =>
    JSON.stringify({
      package: { classes: { "base.ts:Base": { file: "base.ts", extends: [extendsName] } } },
      inputs: { "packages/activerecord/src/base.ts": path.basename(root) },
    });

  const poisonedIn = (root: string) =>
    manifestOf(root, `"${root}/packages/activerecord/src/querying"`);

  /** What `main()` does for one package: serve a servable shared entry, else
   *  extract (the stand-in for the compiler pass), publish, and use that. */
  async function runIn(root: string, extract: () => string) {
    const dir = (await sharedCacheDir(root))!;
    const served = await readSharedFor(dir, NAME, KEY, root);
    if (served !== null) return { manifest: served, extracted: false };
    const own = extract();
    await publishShared(dir, NAME, KEY, own, path.basename(root));
    return { manifest: own, extracted: true };
  }

  it("gives B its own manifest when A's entry carries A's paths", async () => {
    const { a, b } = linkedWorktrees();
    expect(await sharedCacheDir(a), "A and B must share one cache dir").toBe(
      await sharedCacheDir(b),
    );
    // A's own path is not FOREIGN to A: only the writer's test stops it here.
    expect(await runIn(a, () => poisonedIn(a))).toEqual({
      manifest: poisonedIn(a),
      extracted: true,
    });
    expect(
      await readShared((await sharedCacheDir(b))!, NAME, KEY),
      "the poisoned entry must never have been published",
    ).toBeNull();

    const inB = await runIn(b, () => manifestOf(b, "Querying"));
    expect(inB.extracted).toBe(true);
    expect(inB.manifest).toBe(manifestOf(b, "Querying"));
    expect(inB.manifest).not.toContain(a);
  });

  it("declines an already-poisoned entry rather than serving it to B", async () => {
    const { a, b } = linkedWorktrees();
    // Written past the publish gate, as an entry from before this fix would be.
    await writeShared((await sharedCacheDir(a))!, NAME, KEY, poisonedIn(a), path.basename(a));

    const inB = await runIn(b, () => manifestOf(b, "Querying"));
    expect(inB.extracted).toBe(true);
    expect(inB.manifest).toBe(manifestOf(b, "Querying"));
    expect(foreignAbsolutePath(poisonedIn(a), b)).toBe(`${a}/packages/activerecord/src/querying`);
  });

  it("serves A's worktree-independent entry to B unchanged", async () => {
    const { a, b } = linkedWorktrees();
    const clean = manifestOf(a, "Querying");
    expect((await runIn(a, () => clean)).extracted).toBe(true);

    const inB = await runIn(b, () => {
      throw new Error("B must not re-extract a servable entry");
    });
    expect(inB).toEqual({ manifest: clean, extracted: false });
  });

  it("B's refusal to write a foreign manifest names B's own root", () => {
    const { a, b } = linkedWorktrees();
    const foreign = foreignAbsolutePath(poisonedIn(a), b)!;
    const message = foreignManifestMessage(path.join(b, "output/ts-api.json"), foreign, b);
    expect(message).toContain(`outside this worktree (${b})`);
    expect(message).toContain(path.join(b, "output/ts-api.json"));
    expect(message).toContain(foreign);
  });
});
