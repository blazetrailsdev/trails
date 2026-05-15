import { describe, expect, it } from "vitest";
import { SOURCES, type UpstreamSource, validateSources } from "./sources.js";

describe("vendor/sources.ts", () => {
  it("loads without throwing (wave 1 invariant holds)", () => {
    expect(SOURCES).toBeDefined();
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it("declares the rails source with all 9 wave-1 packages", () => {
    const rails = SOURCES.find((s) => s.name === "rails");
    expect(rails).toBeDefined();
    expect(rails!.origin).toEqual({
      type: "git",
      url: "https://github.com/rails/rails.git",
      ref: "v8.0.2",
    });
    expect(rails!.packages.map((p) => p.name).sort()).toEqual(
      [
        "abstractcontroller",
        "actioncontroller",
        "actiondispatch",
        "actionview",
        "activemodel",
        "activerecord",
        "activesupport",
        "arel",
        "trailties",
      ].sort(),
    );
  });

  it("declares the rack source (wave 2)", () => {
    const rack = SOURCES.find((s) => s.name === "rack");
    expect(rack).toBeDefined();
    expect(rack!.origin.ref).toBe("v3.1.14");
    expect(rack!.packages).toEqual([{ name: "rack", libPath: "lib", testPath: "test" }]);
  });

  it("declares the globalid source (wave 3)", () => {
    const gid = SOURCES.find((s) => s.name === "globalid");
    expect(gid).toBeDefined();
    expect(gid!.origin).toEqual({
      type: "git",
      url: "https://github.com/rails/globalid.git",
      ref: "v1.3.0",
    });
    expect(gid!.packages).toEqual([{ name: "globalid", libPath: "lib", testPath: "test" }]);
  });

  it("vendor/sources.lock.json has an entry for every source (commit invariant)", async () => {
    // Catches the failure mode "added to sources.ts, forgot pnpm vendor:fetch":
    // the committed lockfile would be missing the new source's SHA, leaving
    // every fresh checkout to write a different SHA on first fetch and break
    // reproducibility. Reading via fs (not import) so this test doesn't pin
    // a stale require-cache copy if someone runs vendor:fetch mid-suite.
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const lock = JSON.parse(readFileSync(join(here, "sources.lock.json"), "utf8")) as {
      sources: Record<string, { ref: string; sha: string }>;
    };
    for (const source of SOURCES) {
      const entry = lock.sources[source.name];
      expect(entry, `missing lockfile entry for ${source.name}`).toBeDefined();
      expect(entry.ref, `lockfile ref drift for ${source.name}`).toBe(source.origin.ref);
    }
  });

  it("contains every scripts/api-compare/config.ts PACKAGES key (parity for wave 4 derivation)", async () => {
    // Wave 4 will derive PACKAGES from SOURCES. SOURCES may legitimately
    // contain extras not in PACKAGES (e.g. "rack" — vendored for test-compare
    // but not api-compared today). The invariant we need is the other
    // direction: every PACKAGES key must exist in SOURCES.
    const { PACKAGES } = await import("../scripts/api-compare/config.js");
    const sourcePackageNames = new Set(SOURCES.flatMap((s) => s.packages.map((p) => p.name)));
    for (const pkg of PACKAGES) {
      expect(sourcePackageNames.has(pkg)).toBe(true);
    }
  });

  it("validateSources rejects duplicate source names", () => {
    const bad: UpstreamSource[] = [
      { name: "x", origin: { type: "git", url: "u", ref: "r" }, packages: [] },
      { name: "x", origin: { type: "git", url: "u", ref: "r" }, packages: [] },
    ];
    expect(() => validateSources(bad)).toThrow(/duplicate source name "x"/);
  });

  it("validateSources rejects duplicate package names across sources", () => {
    const bad: UpstreamSource[] = [
      {
        name: "a",
        origin: { type: "git", url: "u", ref: "r" },
        packages: [{ name: "shared", libPath: "lib" }],
      },
      {
        name: "b",
        origin: { type: "git", url: "u", ref: "r" },
        packages: [{ name: "shared", libPath: "lib" }],
      },
    ];
    expect(() => validateSources(bad)).toThrow(/duplicate package name "shared"/);
  });

  it("validateSources rejects missing libPath", () => {
    const bad: UpstreamSource[] = [
      {
        name: "x",
        origin: { type: "git", url: "u", ref: "r" },
        // @ts-expect-error — intentional bad shape for the test
        packages: [{ name: "p" }],
      },
    ];
    expect(() => validateSources(bad)).toThrow(/missing libPath/);
  });
});
