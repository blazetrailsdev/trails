import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Upstream Ruby source registry.
//
// Single source of truth for which upstream gems we mirror, where to fetch
// them from, and where each one's lib/test directories live on disk after
// fetching. Designed in docs/ruby-source-fetcher-plan.md.
//
// Each entry corresponds to one vendored root at `vendor/<source-name>/`.
// `libPath` / `testPath` on each package are relative paths *inside* that
// root — for monorepo origins they reach into the gem subdir
// (e.g. `vendor/rails/actionpack/lib/action_dispatch`).

export interface GitOrigin {
  type: "git";
  url: string;
  ref: string;
}

export interface PackageEntry {
  /** Logical package key; surfaces in api-compare's PACKAGES when compareApi !== false. */
  name: string;
  /** Path relative to the source's vendored root. */
  libPath: string;
  /** Path relative to the source's vendored root; omitted = test-compare ignores. */
  testPath?: string;
  /**
   * Default true. Set to false to vendor the source (so test-compare or other
   * tooling can read it) without including it in the api-compare PACKAGES
   * derivation. rack and globalid are vendored today but not yet api-compared
   * — extract-ruby-api.rb's PACKAGE_DIRS doesn't have entries for them. A
   * future wave wires them in and removes this flag (see post-merge findings
   * on PRs #1561 / #1578).
   */
  compareApi?: boolean;
  /**
   * Default true. Mirror of `compareApi` for test-compare. globalid sets this
   * to false in wave 5 (its tests aren't wired into test-compare yet); wave 6
   * flips it on alongside its api-compare wiring.
   */
  compareTests?: boolean;
}

export interface UpstreamSource {
  /** Source name; used as `vendor/<name>/` directory. */
  name: string;
  origin: GitOrigin;
  packages: PackageEntry[];
}

/**
 * Wave-3 state: rails + rack + globalid.
 * The end-state list (all three sources) is enumerated in
 * docs/ruby-source-fetcher-plan.md §2.2.
 *
 * Package names mirror scripts/api-compare/config.ts PACKAGES exactly,
 * including the trails-side rename `trailties` (← railties) and the
 * actionpack split into `actiondispatch` / `actioncontroller` /
 * `abstractcontroller` — each pointing at a distinct lib subdir so
 * derived PACKAGES doesn't need an alias table.
 */
export const SOURCES: readonly UpstreamSource[] = [
  {
    name: "rails",
    origin: {
      type: "git",
      url: "https://github.com/rails/rails.git",
      ref: "v8.0.2",
    },
    packages: [
      {
        name: "arel",
        libPath: "activerecord/lib/arel",
        testPath: "activerecord/test/cases/arel",
      },
      {
        name: "activerecord",
        libPath: "activerecord/lib/active_record",
        testPath: "activerecord/test/cases",
      },
      {
        name: "activemodel",
        libPath: "activemodel/lib/active_model",
        testPath: "activemodel/test/cases",
      },
      {
        name: "activesupport",
        libPath: "activesupport/lib/active_support",
        testPath: "activesupport/test",
      },
      {
        // testPath is the shared `actionpack/test` root — extract-ruby-tests.rb
        // splits the contents between actiondispatch and actioncontroller via
        // an in-extractor filter (see PACKAGE_TEST_DIRS loop). Pointing at the
        // per-subdir path here would shift Ruby-side relative paths and break
        // matching against TS-side test files.
        name: "actiondispatch",
        libPath: "actionpack/lib/action_dispatch",
        testPath: "actionpack/test",
      },
      {
        name: "actioncontroller",
        libPath: "actionpack/lib/action_controller",
        testPath: "actionpack/test",
      },
      {
        name: "abstractcontroller",
        libPath: "actionpack/lib/abstract_controller",
      },
      {
        name: "actionview",
        libPath: "actionview/lib/action_view",
        testPath: "actionview/test",
      },
      {
        name: "trailties",
        libPath: "railties/lib/rails",
        testPath: "railties/test",
      },
    ],
  },
  {
    name: "rack",
    origin: {
      type: "git",
      url: "https://github.com/rack/rack.git",
      ref: "v3.1.14",
    },
    packages: [{ name: "rack", libPath: "lib", testPath: "test", compareApi: false }],
  },
  {
    name: "globalid",
    origin: {
      type: "git",
      url: "https://github.com/rails/globalid.git",
      ref: "v1.3.0",
    },
    packages: [
      {
        name: "globalid",
        libPath: "lib",
        // Globalid puts *_test.rb under test/cases/ (not test/ directly).
        testPath: "test/cases",
        compareApi: false,
        // compareTests defaults to true; globalid tests are already in
        // extract-ruby-tests.rb's PACKAGE_TEST_DIRS (predates this PR).
      },
    ],
  },
];

/**
 * Validate a SOURCES-shaped list. Catches schema mistakes (duplicate names,
 * missing fields) before any consumer reads from the list. Throws on
 * violation. Called from the module's top level so contributors get errors
 * at import, not at fetch time. Exported so wave 2's lockfile/fetcher
 * tooling can reuse the same invariant when reading a manifest.
 */
export function validateSources(sources: readonly UpstreamSource[]): void {
  const sourceNames = new Set<string>();
  const packageNames = new Set<string>();
  for (const source of sources) {
    if (sourceNames.has(source.name)) {
      throw new Error(`vendor/sources.ts: duplicate source name "${source.name}"`);
    }
    sourceNames.add(source.name);
    if (!source.origin.url || !source.origin.ref) {
      throw new Error(`vendor/sources.ts: source "${source.name}" missing origin url/ref`);
    }
    for (const pkg of source.packages) {
      if (packageNames.has(pkg.name)) {
        throw new Error(`vendor/sources.ts: duplicate package name "${pkg.name}" across sources`);
      }
      packageNames.add(pkg.name);
      if (!pkg.libPath) {
        throw new Error(`vendor/sources.ts: package "${pkg.name}" missing libPath`);
      }
    }
  }
}

validateSources(SOURCES);

const VENDOR_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to a vendored package's `lib` (default) or `test` dir, e.g.
 * `resolvePath("activerecord")` → `/.../vendor/rails/activerecord/lib/active_record`.
 * Throws if the package isn't in SOURCES, or if `kind` is "test" but the
 * package has no `testPath`.
 */
export function resolvePath(packageName: string, kind: "lib" | "test" = "lib"): string {
  for (const source of SOURCES) {
    for (const pkg of source.packages) {
      if (pkg.name !== packageName) continue;
      if (kind === "test") {
        if (!pkg.testPath) {
          throw new Error(`vendor/sources.ts: package "${packageName}" has no testPath`);
        }
        return resolve(VENDOR_DIR, source.name, pkg.testPath);
      }
      return resolve(VENDOR_DIR, source.name, pkg.libPath);
    }
  }
  throw new Error(`vendor/sources.ts: no package named "${packageName}"`);
}

/**
 * Names of packages eligible for api-compare's PACKAGES list — every package
 * across all sources whose compareApi flag isn't explicitly set to false.
 * Wave 4: feeds scripts/api-compare/config.ts so PACKAGES becomes derived
 * instead of a hand-maintained literal that drifts from SOURCES.
 */
export function apiComparePackages(): string[] {
  return SOURCES.flatMap((s) => s.packages)
    .filter((p) => p.compareApi !== false)
    .map((p) => p.name);
}

/**
 * Absolute path to a vendored source's clone root, e.g.
 * `vendoredRoot("rails")` → `/.../vendor/rails`. Throws on unknown name.
 */
export function vendoredRoot(sourceName: string): string {
  const found = SOURCES.find((s) => s.name === sourceName);
  if (!found) throw new Error(`vendor/sources.ts: no source named "${sourceName}"`);
  return join(VENDOR_DIR, sourceName);
}

/**
 * Map of package name → absolute test directory for every package with a
 * `testPath` and `compareTests !== false`. Wave 5: feeds extract-ruby-tests.rb
 * via `TEST_PATHS_JSON` env var so the Ruby script's PACKAGE_TEST_DIRS isn't
 * a hand-maintained map that drifts from SOURCES.
 */
export function testPathsManifest(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of SOURCES) {
    for (const pkg of source.packages) {
      if (!pkg.testPath || pkg.compareTests === false) continue;
      out[pkg.name] = resolve(VENDOR_DIR, source.name, pkg.testPath);
    }
  }
  return out;
}
