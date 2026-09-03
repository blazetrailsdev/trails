import { describe, expect, it } from "vitest";
import {
  apiComparePackages,
  libEntryFilesManifest,
  libPathsManifest,
  resolvePath,
  SOURCES,
  testPathsManifest,
  type UpstreamSource,
  validateSources,
  vendoredRoot,
} from "./sources.js";

describe("vendor/sources.ts", () => {
  it("loads without throwing (wave 1 invariant holds)", () => {
    expect(SOURCES).toBeDefined();
    expect(SOURCES.length).toBeGreaterThan(0);
  });

  it("declares the rails source with all 11 packages (9 wave-1 + actionpackversion + test-support)", () => {
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
        "actionpackversion",
        "actionview",
        "activemodel",
        "activerecord",
        "activerecord-test-support",
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
    expect(rack!.packages).toEqual([{ name: "rack", libPath: "lib/rack", testPath: "test" }]);
  });

  it("declares the rack-session source, enrolled in both compares", () => {
    // Rack 3 moved Rack::Session out of rack into its own gem, so vendor/rack
    // (v3.1.14) has no lib/rack/session/. v2.1.0 is what
    // vendor/rails/Gemfile.lock:440 resolves.
    const rackSession = SOURCES.find((s) => s.name === "rack-session");
    expect(rackSession).toBeDefined();
    expect(rackSession!.origin).toEqual({
      type: "git",
      url: "https://github.com/rack/rack-session.git",
      ref: "v2.1.0",
    });
    expect(rackSession!.packages).toEqual([
      {
        name: "rack-session",
        libPath: "lib/rack/session",
        testPath: "test",
      },
    ]);
    expect(apiComparePackages()).toContain("rack-session");
    expect(Object.keys(libPathsManifest())).toContain("rack-session");
    expect(Object.keys(testPathsManifest())).toContain("rack-session");
    expect(resolvePath("rack-session").endsWith("vendor/rack-session/lib/rack/session")).toBe(true);
    expect(resolvePath("rack-session", "test").endsWith("vendor/rack-session/test")).toBe(true);
    expect(vendoredRoot("rack-session").endsWith("vendor/rack-session")).toBe(true);
  });

  it("declares the rack-test source, enrolled in both api-compare and test-compare", () => {
    // actionpack declares `add_dependency "rack-test", ">= 0.6.3"`
    // (vendor/rails/actionpack/actionpack.gemspec:41); v2.2.0 is what
    // vendor/rails/Gemfile.lock:443 resolves.
    const rackTest = SOURCES.find((s) => s.name === "rack-test");
    expect(rackTest).toBeDefined();
    expect(rackTest!.origin).toEqual({
      type: "git",
      url: "https://github.com/rack/rack-test.git",
      ref: "v2.2.0",
    });
    expect(rackTest!.packages).toEqual([
      {
        name: "rack-test",
        libPath: "lib/rack/test",
        libEntryFile: "lib/rack/test.rb",
        testPath: "spec",
      },
    ]);
    expect(apiComparePackages()).toContain("rack-test");
    expect(Object.keys(libPathsManifest())).toContain("rack-test");
    expect(Object.keys(testPathsManifest())).toContain("rack-test");
    expect(resolvePath("rack-test").endsWith("vendor/rack-test/lib/rack/test")).toBe(true);
    expect(resolvePath("rack-test", "test").endsWith("vendor/rack-test/spec")).toBe(true);
    expect(vendoredRoot("rack-test").endsWith("vendor/rack-test")).toBe(true);
  });

  it("declares the globalid source (wave 3)", () => {
    const gid = SOURCES.find((s) => s.name === "globalid");
    expect(gid).toBeDefined();
    expect(gid!.origin).toEqual({
      type: "git",
      url: "https://github.com/rails/globalid.git",
      ref: "v1.3.0",
    });
    expect(gid!.packages).toEqual([
      { name: "globalid", libPath: "lib/global_id", testPath: "test/cases" },
    ]);
  });

  it("declares the date source, enrolled in test-compare only", () => {
    // api-compare stays off deliberately: the gem's surface is C
    // (ext/date/date_core.c), so extract-ruby-api.rb credits only the 12
    // methods in lib/date.rb. RFC 0088 `date-c-source-extractor-decision`.
    const date = SOURCES.find((s) => s.name === "date");
    expect(date).toBeDefined();
    expect(date!.origin).toEqual({
      type: "git",
      url: "https://github.com/ruby/date.git",
      ref: "v3.4.1",
    });
    expect(apiComparePackages()).not.toContain("date");
    expect(Object.keys(libPathsManifest())).not.toContain("date");
    expect(Object.keys(testPathsManifest())).toContain("date");
    expect(resolvePath("date", "test").endsWith("vendor/date/test/date")).toBe(true);
  });

  it("declares the ruby source, read-anchor for api-compare and enrolled in test-compare", () => {
    // MRI is vendored so the C symbols cited across the ruby-compat ports
    // (rational.c, range.c, re.c, object.c) are readable in-tree. `compareApi`
    // stays off permanently: the extractor globs `**/*.rb` and sees none of
    // that C. `compareTests` is on — ruby/ruby mirrors the ruby/spec suite
    // in-tree, and `spec/ruby` (narrowed per ported MEMBER by
    // extract-ruby-tests.rb, which needs the suite root to reach the
    // suite-level `shared/<type>/` bodies) is ruby-compat's behavioural
    // measure.
    const ruby = SOURCES.find((s) => s.name === "ruby");
    expect(ruby).toBeDefined();
    expect(ruby!.origin).toEqual({
      type: "git",
      url: "https://github.com/ruby/ruby.git",
      ref: "v3_3_11",
    });
    expect(ruby!.packages).toEqual([
      {
        name: "ruby-compat",
        libPath: "lib",
        testPath: "spec/ruby",
        compareApi: false,
      },
    ]);
    expect(apiComparePackages()).not.toContain("ruby-compat");
    expect(Object.keys(libPathsManifest())).not.toContain("ruby-compat");
    expect(Object.keys(testPathsManifest())).toContain("ruby-compat");
    expect(resolvePath("ruby-compat").endsWith("vendor/ruby/lib")).toBe(true);
    expect(resolvePath("ruby-compat", "test").endsWith("vendor/ruby/spec/ruby")).toBe(true);
    expect(vendoredRoot("ruby").endsWith("vendor/ruby")).toBe(true);
  });

  it("declares the i18n source, enrolled in both api-compare and test-compare", () => {
    const i18n = SOURCES.find((s) => s.name === "i18n");
    expect(i18n).toBeDefined();
    expect(i18n!.origin).toEqual({
      type: "git",
      url: "https://github.com/ruby-i18n/i18n.git",
      ref: "v1.14.8",
    });
    expect(i18n!.packages).toEqual([
      {
        name: "i18n",
        libPath: "lib/i18n",
        libEntryFile: "lib/i18n.rb",
        testPath: "test",
      },
    ]);
    expect(Object.keys(libEntryFilesManifest())).toEqual(["arel", "rack-test", "i18n"]);
    expect(apiComparePackages()).toContain("i18n");
    expect(Object.keys(libPathsManifest())).toContain("i18n");
    expect(Object.keys(testPathsManifest())).toContain("i18n");
    expect(resolvePath("i18n").endsWith("vendor/i18n/lib/i18n")).toBe(true);
    expect(resolvePath("i18n", "test").endsWith("vendor/i18n/test")).toBe(true);
    expect(vendoredRoot("i18n").endsWith("vendor/i18n")).toBe(true);
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

  it("resolvePath returns absolute lib path for a known package", () => {
    const p = resolvePath("activerecord");
    expect(p.endsWith("vendor/rails/activerecord/lib/active_record")).toBe(true);
  });

  it("resolvePath('test') returns absolute test path", () => {
    const p = resolvePath("activerecord", "test");
    expect(p.endsWith("vendor/rails/activerecord/test/cases")).toBe(true);
  });

  it("resolvePath throws for unknown package", () => {
    expect(() => resolvePath("nope")).toThrow(/no package named "nope"/);
  });

  it("resolvePath throws when test requested for package without testPath", () => {
    expect(() => resolvePath("actionpackversion", "test")).toThrow(/no testPath/);
  });

  it("vendoredRoot returns absolute source root", () => {
    expect(vendoredRoot("rails").endsWith("vendor/rails")).toBe(true);
  });

  it("vendoredRoot throws for unknown source", () => {
    expect(() => vendoredRoot("nope")).toThrow(/no source named "nope"/);
  });

  it("apiComparePackages includes rack and globalid (wave 6: compareApi flipped on)", () => {
    const pkgs = apiComparePackages();
    expect(pkgs).toContain("rack");
    expect(pkgs).toContain("globalid");
    expect(pkgs).toContain("activerecord");
    expect(pkgs).toContain("abstractcontroller");
  });

  it("apiComparePackages returns exactly the current api-compare set", () => {
    // Bulletproofs against a future PR that accidentally toggles compareApi
    // on a package, or adds/drops a source from SOURCES without updating
    // extract-ruby-api.rb. extract-ruby-api.rb's PACKAGE_DIRS is now derived
    // from libPathsManifest() — same SOURCES list — so this assertion stays
    // in lockstep with the Ruby script automatically.
    expect(apiComparePackages().sort()).toEqual(
      [
        "abstractcontroller",
        "actioncontroller",
        "actiondispatch",
        "actionpackversion",
        "actionview",
        "activemodel",
        "activerecord",
        "activerecord-test-support",
        "activesupport",
        "arel",
        "did-you-mean",
        "globalid",
        "i18n",
        "rack",
        "rack-session",
        "rack-test",
        "trailties",
      ].sort(),
    );
  });

  it("libPathsManifest returns absolute lib dirs for every api-compared package", () => {
    const m = libPathsManifest();
    expect(Object.keys(m).sort()).toEqual(apiComparePackages().sort());
    expect(m["activerecord"].endsWith("vendor/rails/activerecord/lib/active_record")).toBe(true);
    expect(
      m["abstractcontroller"].endsWith("vendor/rails/actionpack/lib/abstract_controller"),
    ).toBe(true);
    expect(m["rack"].endsWith("vendor/rack/lib/rack")).toBe(true);
    expect(m["globalid"].endsWith("vendor/globalid/lib/global_id")).toBe(true);
  });

  it("testPathsManifest returns absolute test dirs for every test-compared package", () => {
    const m = testPathsManifest();
    expect(Object.keys(m).sort()).toEqual(
      [
        "abstractcontroller",
        "actioncontroller",
        "actiondispatch",
        "actionview",
        "activemodel",
        "activerecord",
        "activesupport",
        "arel",
        "date",
        "did-you-mean",
        "globalid",
        "i18n",
        "rack",
        "rack-session",
        "rack-test",
        "ruby-compat",
        "trailties",
      ].sort(),
    );
    expect(m["activerecord"].endsWith("vendor/rails/activerecord/test/cases")).toBe(true);
    expect(m["rack"].endsWith("vendor/rack/test")).toBe(true);
    expect(m["globalid"].endsWith("vendor/globalid/test/cases")).toBe(true);
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
