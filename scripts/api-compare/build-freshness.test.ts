/**
 * Tests for the stale-build guard: a checkout-based `api:extra` baseline is
 * only trustworthy while every package's `dist` was produced from the sources
 * currently on disk, and `git checkout` never updates `dist`.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { staleBuilds, staleBuildMessage, manifestIsStale } from "./build-freshness.js";
import type { PackageRoots } from "./config.js";

/** A whole-directory extraction root — the common case (`activerecord`, `arel`). */
function rootFor(packagesDir: string, dir: string, subDir?: string): PackageRoots {
  const packageDir = path.join(packagesDir, dir);
  return {
    dir,
    srcDir: subDir ? path.join(packageDir, "src", subDir) : path.join(packageDir, "src"),
    distDir: path.join(packageDir, "dist"),
  };
}

/**
 * Every directory under `packagesDir` as an extraction root — the shorthand for
 * tests where every package created IS api-compared. Scoping itself is covered
 * by the tests that pass an explicit root list.
 */
function allRoots(packagesDir: string): PackageRoots[] {
  let dirs: string[];
  try {
    dirs = fs.readdirSync(packagesDir);
  } catch {
    return [];
  }
  return dirs.map((dir) => rootFor(packagesDir, dir));
}

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-freshness-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function setMtime(target: string, seconds: number): void {
  fs.utimesSync(target, seconds, seconds);
}

/** Age every directory at or under `dir` — creating files leaves them at "now". */
function ageDirs(dir: string, seconds: number): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) ageDirs(path.join(dir, entry.name), seconds);
  }
  setMtime(dir, seconds);
}

/** A package whose `dist` was built AFTER its sources — the healthy state. */
function buildPackage(packagesDir: string, name: string, sources = ["index.ts"]): string {
  const pkg = path.join(packagesDir, name);
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  for (const source of sources) {
    const file = path.join(pkg, "src", source);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "export const a = 1;\n");
    setMtime(file, 1000);
  }
  ageDirs(path.join(pkg, "src"), 1000);
  fs.writeFileSync(path.join(pkg, "dist", "index.d.ts"), "export declare const a: number;\n");
  setMtime(path.join(pkg, "dist", "index.d.ts"), 2000);
  return pkg;
}

/** Stand-in for `git checkout` rewriting a tracked file's contents. */
function checkoutRewrite(pkg: string, source: string, seconds: number): void {
  const file = path.join(pkg, "src", source);
  fs.writeFileSync(file, "export const a = 2;\n");
  setMtime(file, seconds);
}

/** Stand-in for `git checkout` deleting a tracked file: only the dir mtime moves. */
function checkoutDelete(pkg: string, source: string, seconds: number): void {
  const file = path.join(pkg, "src", source);
  fs.rmSync(file);
  setMtime(path.dirname(file), seconds);
}

/** Stand-in for `pnpm build` refreshing the package's declarations. */
function rebuild(pkg: string, seconds: number): void {
  setMtime(path.join(pkg, "dist", "index.d.ts"), seconds);
}

describe("staleBuilds", () => {
  it("reports nothing when every dist is newer than its sources", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties", ["index.ts", "railtie/configuration.ts"]);
    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);
  });

  it("reports a package whose sources were checked out after its dist was built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");
    checkoutRewrite(pkg, "index.ts", 3000);

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([
      { dir: "activesupport", newestSource: "packages/activesupport/src/index.ts" },
    ]);
  });

  it("finds the newest source in a nested directory", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activerecord", ["base.ts", "relation/query-methods.ts"]);
    checkoutRewrite(pkg, "relation/query-methods.ts", 3000);

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([
      { dir: "activerecord", newestSource: "packages/activerecord/src/relation/query-methods.ts" },
    ]);
  });

  it("catches a checkout that only DELETES a source file", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "arel", ["index.ts", "nodes/casted.ts"]);
    // Every surviving file keeps its old mtime; only the parent dir moves.
    checkoutDelete(pkg, "nodes/casted.ts", 3000);

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([
      { dir: "arel", newestSource: "packages/arel/src/nodes" },
    ]);
  });

  it("ignores a package that was never built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = path.join(packagesDir, "arel");
    fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "src", "index.ts"), "export const a = 1;\n");

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);
  });

  it("ignores a package with no sources", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = path.join(packagesDir, "website");
    fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "dist", "index.d.ts"), "export {};\n");

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);
  });

  it("ignores non-source files under src and non-declarations under dist", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activemodel");
    const fixture = path.join(pkg, "src", "fixtures.json");
    fs.writeFileSync(fixture, "{}\n");
    setMtime(fixture, 3000);
    ageDirs(path.join(pkg, "src"), 1000);
    // A .d.ts is what resolution reads; a stray .js must not vouch for it.
    const emitted = path.join(pkg, "dist", "index.js");
    fs.writeFileSync(emitted, "export const a = 1;\n");
    setMtime(emitted, 4000);

    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);
  });

  it("returns an empty list when there are no roots", async () => {
    const root = mkTmp();
    expect(await staleBuilds(allRoots(path.join(root, "packages")), root)).toEqual([]);
  });

  it("ignores a workspace that api-compare does not extract", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activerecord");
    // `activerecord-cli` is a workspace, not an api-compare package: it cannot
    // affect the TS manifest, so a stale build there must not block a run.
    checkoutRewrite(buildPackage(packagesDir, "activerecord-cli"), "index.ts", 3000);

    expect(await staleBuilds([rootFor(packagesDir, "activerecord")], root)).toEqual([]);
  });

  it("scopes to the src subdir the extractor compiles, not the whole package dir", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "actionpack", [
      "action-dispatch/http/headers.ts",
      "action-controller/base.ts",
    ]);
    checkoutRewrite(pkg, "action-controller/base.ts", 3000);

    // The actiondispatch root's own subdir is untouched…
    expect(
      await staleBuilds([rootFor(packagesDir, "actionpack", "action-dispatch")], root),
    ).toEqual([]);
    // …while the actioncontroller root sees it.
    expect(
      await staleBuilds([rootFor(packagesDir, "actionpack", "action-controller")], root),
    ).toEqual([
      { dir: "actionpack", newestSource: "packages/actionpack/src/action-controller/base.ts" },
    ]);
  });

  it("collapses roots that share one package directory into a single report", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "actionpack", [
      "action-dispatch/http/headers.ts",
      "action-controller/base.ts",
    ]);
    checkoutRewrite(pkg, "action-dispatch/http/headers.ts", 3000);
    checkoutRewrite(pkg, "action-controller/base.ts", 4000);

    expect(
      await staleBuilds(
        [
          rootFor(packagesDir, "actionpack", "action-dispatch"),
          rootFor(packagesDir, "actionpack", "action-controller"),
        ],
        root,
      ),
    ).toEqual([
      { dir: "actionpack", newestSource: "packages/actionpack/src/action-controller/base.ts" },
    ]);
  });

  it("sorts by package directory so the message is stable across runs", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    for (const name of ["trailties", "actionview", "activesupport"]) {
      checkoutRewrite(buildPackage(packagesDir, name), "index.ts", 3000);
    }
    const stale = await staleBuilds(allRoots(packagesDir), root);
    expect(stale.map((entry) => entry.dir)).toEqual(["actionview", "activesupport", "trailties"]);
  });

  it("stays clean across a checkout-away-and-back sequence that rebuilds each time", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");

    // check out origin/main
    checkoutRewrite(pkg, "index.ts", 3000);
    expect(await staleBuilds(allRoots(packagesDir), root)).toHaveLength(1);
    rebuild(pkg, 4000);
    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);

    // check the branch back out
    checkoutRewrite(pkg, "index.ts", 5000);
    expect(await staleBuilds(allRoots(packagesDir), root)).toHaveLength(1);
    rebuild(pkg, 6000);
    expect(await staleBuilds(allRoots(packagesDir), root)).toEqual([]);
  });
});

describe("manifestIsStale", () => {
  function writeManifest(root: string, seconds: number): string {
    const manifest = path.join(root, "ts-api.json");
    fs.writeFileSync(manifest, "{}\n");
    setMtime(manifest, seconds);
    return manifest;
  }

  it("is false for a manifest written after the last checkout", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activesupport");
    expect(await manifestIsStale(writeManifest(root, 5000), allRoots(packagesDir))).toBe(false);
  });

  it("is true when a checkout landed after the manifest was written", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    const manifest = writeManifest(root, 5000);
    checkoutRewrite(pkg, "index.ts", 6000);
    expect(await manifestIsStale(manifest, allRoots(packagesDir))).toBe(true);
  });

  it("is false when the manifest does not exist", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activesupport");
    expect(await manifestIsStale(path.join(root, "missing.json"), allRoots(packagesDir))).toBe(
      false,
    );
  });

  it("is false when there are no roots to compare against", async () => {
    const root = mkTmp();
    expect(
      await manifestIsStale(writeManifest(root, 5000), allRoots(path.join(root, "packages"))),
    ).toBe(false);
  });

  it("ignores a checkout that only touched a workspace api-compare does not extract", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activerecord");
    const manifest = writeManifest(root, 5000);
    checkoutRewrite(buildPackage(packagesDir, "trails-tsc"), "index.ts", 6000);

    expect(await manifestIsStale(manifest, [rootFor(packagesDir, "activerecord")])).toBe(false);
  });
});

describe("staleBuildMessage", () => {
  it("names every stale package and how to fix it", () => {
    const message = staleBuildMessage([
      { dir: "trailties", newestSource: "packages/trailties/src/application.ts" },
      { dir: "actionview", newestSource: "packages/actionview/src/base.ts" },
    ]);
    expect(message).toContain("2 package(s)");
    expect(message).toContain("packages/trailties — newer: packages/trailties/src/application.ts");
    expect(message).toContain("packages/actionview — newer: packages/actionview/src/base.ts");
    expect(message).toContain("pnpm build");
    expect(message).toContain("API_COMPARE_ALLOW_STALE_BUILD=1");
  });
});
