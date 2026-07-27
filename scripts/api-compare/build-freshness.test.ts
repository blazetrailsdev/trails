/**
 * Tests for the stale-build guard: a checkout-based `api:extra` baseline is
 * only trustworthy while every package's `dist` was produced from the sources
 * currently on disk, and `git checkout` never updates `dist`.
 *
 * These build REAL tsc projects rather than faking timestamps. The guard
 * delegates to `tsc`'s own up-to-date computation precisely so it can never
 * disagree with `pnpm build`, and a test that stubbed that oracle out would
 * verify nothing — the previous mtime-based implementation passed a full suite
 * of fixture tests and still failed every CI run.
 */
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import ts from "typescript";
import { staleBuilds, staleBuildMessage, manifestIsStale } from "./build-freshness.js";
import type { PackageRoots } from "./config.js";

const tmpDirs: string[] = [];
function mkTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-freshness-"));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function rootFor(packagesDir: string, dir: string, subDir?: string): PackageRoots {
  const packageDir = path.join(packagesDir, dir);
  return {
    dir,
    srcDir: subDir ? path.join(packageDir, "src", subDir) : path.join(packageDir, "src"),
    distDir: path.join(packageDir, "dist"),
    configPath: path.join(packageDir, "tsconfig.json"),
  };
}

/** Lay down a composite package and compile it, exactly as `pnpm build` would. */
function buildPackage(
  packagesDir: string,
  name: string,
  sources = { "index.ts": "export const a = 1;\n" },
): string {
  const pkg = path.join(packagesDir, name);
  fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
  for (const [file, body] of Object.entries(sources)) {
    const full = path.join(pkg, "src", file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.writeFileSync(
    path.join(pkg, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        composite: true,
        declaration: true,
        outDir: "dist",
        rootDir: "src",
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
        skipLibCheck: true,
      },
      include: ["src"],
    }),
  );
  build(path.join(pkg, "tsconfig.json"));
  return pkg;
}

function build(configPath: string): void {
  ts.createSolutionBuilder(ts.createSolutionBuilderHost(ts.sys), [configPath], {}).build();
}

/**
 * Stand-in for `git checkout` rewriting a tracked file's contents.
 *
 * The mtime is pushed a minute ahead deliberately. tsc's up-to-date check
 * compares timestamps, and a test that rewrites a file in the same clock tick
 * as the build that just produced it reads as up to date — an artifact of
 * writing both instantly, not of the guard. A real checkout is always well
 * separated from the build it invalidates.
 */
function checkoutRewrite(pkg: string, source: string, body: string): void {
  const file = path.join(pkg, "src", source);
  fs.writeFileSync(file, body);
  const ahead = new Date(Date.now() + 60_000);
  fs.utimesSync(file, ahead, ahead);
}

describe("staleBuilds", () => {
  it("reports nothing when every package was built from its current sources", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");

    expect(await staleBuilds([...rootsOf(packagesDir, "activesupport", "trailties")])).toEqual([]);
  });

  it("reports a package whose sources were checked out after its dist was built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activesupport");
    buildPackage(packagesDir, "trailties");
    checkoutRewrite(pkg, "index.ts", "export const a = 2;\n");

    expect(await staleBuilds([...rootsOf(packagesDir, "activesupport", "trailties")])).toEqual([
      { dir: "activesupport", status: "OutOfDateWithSelf" },
    ]);
  });

  it("catches a checkout that only DELETES a source file", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "arel", {
      "index.ts": "export const a = 1;\n",
      "nodes/casted.ts": "export const b = 2;\n",
    });
    // Every surviving file keeps its mtime; only the project's root set moves.
    fs.rmSync(path.join(pkg, "src", "nodes", "casted.ts"));

    expect(await staleBuilds([rootFor(packagesDir, "arel")])).toEqual([
      { dir: "arel", status: "OutOfDateRoots" },
    ]);
  });

  it("does NOT fire when dist was restored from a cache with older mtimes", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "activerecord");

    // Exactly CI: `cache-build` restores dist + tsbuildinfo carrying ARCHIVE
    // mtimes, then `actions/checkout` leaves every source stamped "now". The
    // tree is current — the buildinfo agrees with the sources — but every
    // output is older than every input. An mtime oracle fails the whole
    // workspace here; tsc's does not.
    for (const output of [path.join(pkg, "dist"), path.join(pkg, "tsconfig.tsbuildinfo")]) {
      ageTree(output, new Date("2020-01-01T00:00:00Z"));
    }
    const now = new Date();
    for (const source of walk(path.join(pkg, "src"))) fs.utimesSync(source, now, now);
    // CI always runs `pnpm build` between the restore and the comparison. It
    // no-ops on content (nothing is re-emitted, dist keeps its archive mtimes)
    // but refreshes the buildinfo, which is what tsc consults.
    build(path.join(pkg, "tsconfig.json"));

    expect(await staleBuilds([rootFor(packagesDir, "activerecord")])).toEqual([]);
  });

  it("ignores a package that was never built", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "arel");
    // A dist-less package resolves to nothing at every commit — consistent,
    // so not a mixed tree. tsc alone would call this up to date (the surviving
    // tsbuildinfo vouches for it), which is why the check is ours.
    fs.rmSync(path.join(pkg, "dist"), { recursive: true });

    expect(await staleBuilds([rootFor(packagesDir, "arel")])).toEqual([]);
  });

  it("returns an empty list when there are no roots", async () => {
    expect(await staleBuilds([])).toEqual([]);
  });

  it("ignores a workspace that api-compare does not extract", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    buildPackage(packagesDir, "activerecord");
    // `activerecord-cli` is a workspace, not an api-compare package: it cannot
    // affect the TS manifest, so a stale build there must not block a run.
    checkoutRewrite(
      buildPackage(packagesDir, "activerecord-cli"),
      "index.ts",
      "export const a = 2;\n",
    );

    expect(await staleBuilds([rootFor(packagesDir, "activerecord")])).toEqual([]);
  });

  it("collapses roots that share one package directory into a single report", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = buildPackage(packagesDir, "actionpack", {
      "action-dispatch/http/headers.ts": "export const a = 1;\n",
      "action-controller/base.ts": "export const b = 2;\n",
    });
    checkoutRewrite(pkg, "action-controller/base.ts", "export const b = 3;\n");

    expect(
      await staleBuilds([
        rootFor(packagesDir, "actionpack", "action-dispatch"),
        rootFor(packagesDir, "actionpack", "action-controller"),
      ]),
    ).toEqual([{ dir: "actionpack", status: "OutOfDateWithSelf" }]);
  });

  it("sorts by package directory so the message is stable across runs", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    for (const name of ["trailties", "actionview", "activesupport"]) {
      checkoutRewrite(buildPackage(packagesDir, name), "index.ts", "export const a = 2;\n");
    }
    const stale = await staleBuilds([
      ...rootsOf(packagesDir, "trailties", "actionview", "activesupport"),
    ]);
    expect(stale.map((entry) => entry.dir)).toEqual(["actionview", "activesupport", "trailties"]);
  });
});

function rootsOf(packagesDir: string, ...dirs: string[]): PackageRoots[] {
  return dirs.map((dir) => rootFor(packagesDir, dir));
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function ageTree(target: string, when: Date): void {
  if (fs.statSync(target).isDirectory()) {
    for (const file of walk(target)) fs.utimesSync(file, when, when);
  }
  fs.utimesSync(target, when, when);
}

describe("manifestIsStale", () => {
  function writeManifest(root: string, seconds: number): string {
    const manifest = path.join(root, "ts-api.json");
    fs.writeFileSync(manifest, "{}\n");
    fs.utimesSync(manifest, seconds, seconds);
    return manifest;
  }

  function agedPackage(packagesDir: string, name: string, seconds: number): string {
    const pkg = path.join(packagesDir, name);
    fs.mkdirSync(path.join(pkg, "src"), { recursive: true });
    const file = path.join(pkg, "src", "index.ts");
    fs.writeFileSync(file, "export const a = 1;\n");
    fs.utimesSync(file, seconds, seconds);
    fs.utimesSync(path.join(pkg, "src"), seconds, seconds);
    return pkg;
  }

  it("is false for a manifest written after the last checkout", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    agedPackage(packagesDir, "activesupport", 1000);
    expect(
      await manifestIsStale(writeManifest(root, 5000), [rootFor(packagesDir, "activesupport")]),
    ).toBe(false);
  });

  it("is true when a checkout landed after the manifest was written", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    const pkg = agedPackage(packagesDir, "activesupport", 1000);
    const manifest = writeManifest(root, 5000);
    fs.utimesSync(path.join(pkg, "src", "index.ts"), 6000, 6000);

    expect(await manifestIsStale(manifest, [rootFor(packagesDir, "activesupport")])).toBe(true);
  });

  it("is false when the manifest does not exist", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    agedPackage(packagesDir, "activesupport", 1000);
    expect(
      await manifestIsStale(path.join(root, "missing.json"), [
        rootFor(packagesDir, "activesupport"),
      ]),
    ).toBe(false);
  });

  it("is false when there are no roots to compare against", async () => {
    const root = mkTmp();
    expect(await manifestIsStale(writeManifest(root, 5000), [])).toBe(false);
  });

  it("ignores a checkout that only touched a workspace api-compare does not extract", async () => {
    const root = mkTmp();
    const packagesDir = path.join(root, "packages");
    agedPackage(packagesDir, "activerecord", 1000);
    const manifest = writeManifest(root, 5000);
    agedPackage(packagesDir, "trails-tsc", 6000);

    expect(await manifestIsStale(manifest, [rootFor(packagesDir, "activerecord")])).toBe(false);
  });
});

describe("staleBuildMessage", () => {
  it("names every stale package and how to fix it", () => {
    const message = staleBuildMessage([
      { dir: "trailties", status: "OutOfDateWithSelf" },
      { dir: "actionview", status: "OutOfDateRoots" },
    ]);
    expect(message).toContain("2 package(s)");
    expect(message).toContain("packages/trailties — OutOfDateWithSelf");
    expect(message).toContain("packages/actionview — OutOfDateRoots");
    expect(message).toContain("pnpm build");
    expect(message).toContain("API_COMPARE_ALLOW_STALE_BUILD=1");
  });
});
