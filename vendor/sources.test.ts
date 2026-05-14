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

  it("matches scripts/api-compare/config.ts PACKAGES keys (parity with wave 4 derivation)", async () => {
    const { PACKAGES } = await import("../scripts/api-compare/config.js");
    const sourcePackageNames = SOURCES.flatMap((s) => s.packages.map((p) => p.name)).sort();
    expect(sourcePackageNames).toEqual([...PACKAGES].sort());
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
