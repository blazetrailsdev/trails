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
  /** Logical package key; surfaces in api-compare's PACKAGES. */
  name: string;
  /** Path relative to the source's vendored root. */
  libPath: string;
  /** Path relative to the source's vendored root; omitted = test-compare ignores. */
  testPath?: string;
}

export interface UpstreamSource {
  /** Source name; used as `vendor/<name>/` directory. */
  name: string;
  origin: GitOrigin;
  packages: PackageEntry[];
}

/**
 * Wave-1 state: rails only. Rack lands in wave 2, globalid in wave 3.
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
        name: "actiondispatch",
        libPath: "actionpack/lib/action_dispatch",
        testPath: "actionpack/test/dispatch",
      },
      {
        name: "actioncontroller",
        libPath: "actionpack/lib/action_controller",
        testPath: "actionpack/test/controller",
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
];

/**
 * Validate SOURCES at load time. Catches schema mistakes (duplicate names,
 * missing fields) before any consumer reads from the list. Throws on
 * violation. Called from the module's top level so wave-1 contributors
 * get errors at import, not at fetch time.
 */
function validate(sources: readonly UpstreamSource[]): void {
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

validate(SOURCES);
