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

/** A package whose `dist` was built AFTER its sources — the healthy state. */
function buildPackage(packagesDir: string, name: string, body = "export const a = 1;\n"): string {
  const pkg = path.join(packagesDir, name);
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
  fs.mkdirSync(path.join(pkg, "dist"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "src", "index.ts"), body);
  fs.writeFileSync(path.join(pkg, "dist", "index.d.ts"), "export declare const a: number;\n");
  setMtime(path.join(pkg, "src", "index.ts"), 1000);
  setMtime(path.join(pkg, "dist", "index.d.ts"), 2000);
  return pkg;
}

/** Stand-in for what `git checkout` does to a file it rewrites. */
function checkoutSource(pkg: string, body: string, seconds: number): void {
  fs.writeFileSync(path.join(pkg, "src", "index.ts"), body);
  setMtime(path.join(pkg, "src", "index.ts"), seconds);
}

function setMtime(file: string, seconds: number): void {
  fs.utimesSync(file, seconds, seconds);
}

describe("staleBuilds", () => {
  it("reports nothing when every dist is newer than its sources", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");
    expect(await staleBuilds(packagesDir, root)).toEqual([]);
  });

  it("reports a package whose sources were checked out after its dist was built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");
    checkoutSource(pkg, "export const a = 2;\n", 3000);

    expect(await staleBuilds(packagesDir, root)).toEqual([
      { dir: "activesupport", newestSource: "packages/activesupport/src/index.ts" },
    ]);
  });

  it("finds the newest source in a nested directory", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activerecord");
    const nested = path.join(pkg, "src", "relation");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, "query-methods.ts"), "export const b = 1;\n");
    setMtime(path.join(nested, "query-methods.ts"), 3000);

    expect(await staleBuilds(packagesDir, root)).toEqual([
      { dir: "activerecord", newestSource: "packages/activerecord/src/relation/query-methods.ts" },
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

  it("returns an empty list when there is no packages directory", async () => {
    const root = mkTmp();
    expect(await staleBuilds(path.join(root, "packages"), root)).toEqual([]);
  });

  it("sorts by package directory so the message is stable across runs", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    for (const name of ["trailties", "actionview", "activesupport"]) {
      checkoutSource(buildPackage(packagesDir, name), "export const a = 2;\n", 3000);
    }
    const stale = await staleBuilds(packagesDir, root);
    expect(stale.map((entry) => entry.dir)).toEqual(["actionview", "activesupport", "trailties"]);
  });

  it("stays clean across a checkout-away-and-back sequence that rebuilds each time", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");

    // checkout origin/main, rebuild, measure
    checkoutSource(pkg, "export const a = 2;\n", 3000);
    expect(await staleBuilds(packagesDir, root)).toHaveLength(1);
    setMtime(path.join(pkg, "dist", "index.d.ts"), 4000);
    expect(await staleBuilds(packagesDir, root)).toEqual([]);

    // checkout the branch back, rebuild, measure
    checkoutSource(pkg, "export const a = 1;\n", 5000);
    expect(await staleBuilds(packagesDir, root)).toHaveLength(1);
    setMtime(path.join(pkg, "dist", "index.d.ts"), 6000);
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
