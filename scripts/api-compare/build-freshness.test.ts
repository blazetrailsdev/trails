/**
 * Tests for the stale-build guard: a checkout-based `api:extra` baseline is
 * only trustworthy while every package's `dist` was produced from the sources
 * currently on disk, and `git checkout` never updates `dist`.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { staleBuilds, staleBuildMessage } from "./build-freshness.js";

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
    expect(await staleBuilds(packagesDir, root)).toEqual([]);
  });

  it("reports a package whose sources were checked out after its dist was built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");
    checkoutRewrite(pkg, "index.ts", 3000);

    expect(await staleBuilds(packagesDir, root)).toEqual([
      { dir: "activesupport", newestSource: "packages/activesupport/src/index.ts" },
    ]);
  });

  it("finds the newest source in a nested directory", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activerecord", ["base.ts", "relation/query-methods.ts"]);
    checkoutRewrite(pkg, "relation/query-methods.ts", 3000);

    expect(await staleBuilds(packagesDir, root)).toEqual([
      { dir: "activerecord", newestSource: "packages/activerecord/src/relation/query-methods.ts" },
    ]);
  });

  it("catches a checkout that only DELETES a source file", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "arel", ["index.ts", "nodes/casted.ts"]);
    // Every surviving file keeps its old mtime; only the parent dir moves.
    checkoutDelete(pkg, "nodes/casted.ts", 3000);

    expect(await staleBuilds(packagesDir, root)).toEqual([
      { dir: "arel", newestSource: "packages/arel/src/nodes" },
    ]);
  });

  it("ignores a package that was never built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = path.join(packagesDir, "arel");
    fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "src", "index.ts"), "export const a = 1;\n");

    expect(await staleBuilds(packagesDir, root)).toEqual([]);
  });

  it("ignores a package with no sources", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = path.join(packagesDir, "website");
    fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "dist", "index.d.ts"), "export {};\n");

    expect(await staleBuilds(packagesDir, root)).toEqual([]);
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

    expect(await staleBuilds(packagesDir, root)).toEqual([]);
  });

  it("returns an empty list when there is no packages directory", async () => {
    const root = mkTmp();
    expect(await staleBuilds(path.join(root, "packages"), root)).toEqual([]);
  });

  it("sorts by package directory so the message is stable across runs", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    for (const name of ["trailties", "actionview", "activesupport"]) {
      checkoutRewrite(buildPackage(packagesDir, name), "index.ts", 3000);
    }
    const stale = await staleBuilds(packagesDir, root);
    expect(stale.map((entry) => entry.dir)).toEqual(["actionview", "activesupport", "trailties"]);
  });

  it("stays clean across a checkout-away-and-back sequence that rebuilds each time", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");

    // check out origin/main
    checkoutRewrite(pkg, "index.ts", 3000);
    expect(await staleBuilds(packagesDir, root)).toHaveLength(1);
    rebuild(pkg, 4000);
    expect(await staleBuilds(packagesDir, root)).toEqual([]);

    // check the branch back out
    checkoutRewrite(pkg, "index.ts", 5000);
    expect(await staleBuilds(packagesDir, root)).toHaveLength(1);
    rebuild(pkg, 6000);
    expect(await staleBuilds(packagesDir, root)).toEqual([]);
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
