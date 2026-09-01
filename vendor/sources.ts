import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Upstream Ruby source registry.
//
// Single source of truth for which upstream gems we mirror, where to fetch
// them from, and where each one's lib/test directories live on disk after
// fetching.
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
   * derivation. Reserved for cases where the extractor can't yet handle a
   * gem's idioms, or where no TS-side package dir exists yet to map onto.
   * Rack and globalid were wired into api-compare in wave 6 (#1589), i18n
   * once packages/i18n existed; today no source sets it.
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
        // Rails' test-support helpers (`test/support/*.rb`) — DDL/schema-dump/
        // connection helpers our suite ports into
        // `packages/activerecord/src/support/`. A pseudo-package rather than a
        // second root on `activerecord` because api-compare keys one lib dir
        // per package. No `testPath`: these are helpers, not test cases.
        name: "activerecord-test-support",
        libPath: "activerecord/test/support",
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
        testPath: "actionpack/test/abstract",
      },
      {
        name: "actionpackversion",
        libPath: "actionpack/lib/action_pack",
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
    // libPath points at `lib/rack/` (the Rack module root) for symmetry with
    // how Rails subgems are mapped — see e.g. activerecord/lib/active_record.
    // Bare `lib` would also scan lib/rack.rb (the entrypoint shim).
    packages: [{ name: "rack", libPath: "lib/rack", testPath: "test" }],
  },
  {
    name: "rack-session",
    origin: {
      type: "git",
      url: "https://github.com/rack/rack-session.git",
      // vendor/rails/Gemfile.lock:440 resolves rack-session (2.1.0), inside
      // both declared ranges (actionpack `>= 1.0.1`,
      // vendor/rails/actionpack/actionpack.gemspec:40; railties
      // `>= 2.0.0, < 3`, vendor/rails/Gemfile.lock:569).
      ref: "v2.1.0",
    },
    // libPath points at `lib/rack/session/` (the Rack::Session module root)
    // for the same reason `rack` above points at `lib/rack`: bare `lib` would
    // also scan lib/rack/session.rb (the entrypoint shim).
    packages: [
      {
        name: "rack-session",
        libPath: "lib/rack/session",
        testPath: "test",
      },
    ],
  },
  {
    name: "did_you_mean",
    origin: {
      type: "git",
      url: "https://github.com/ruby/did_you_mean.git",
      ref: "v1.6.3",
    },
    packages: [
      {
        // TS-side workspace dir is `packages/did-you-mean/src`; api-compare
        // derives that from the package name, so use the kebab form.
        name: "did-you-mean",
        libPath: "lib/did_you_mean",
        testPath: "test",
      },
    ],
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
        // Globalid's lib root is `lib/global_id/` (Ruby module GlobalID maps
        // to global_id). Pointing at `lib` directly would scan global_id.rb +
        // global_id/*.rb together; pointing at `lib/global_id` matches the
        // pattern used for activerecord (lib/active_record/).
        libPath: "lib/global_id",
        // Globalid puts *_test.rb under test/cases/ (not test/ directly).
        testPath: "test/cases",
      },
    ],
  },
  {
    name: "date",
    origin: {
      type: "git",
      url: "https://github.com/ruby/date.git",
      ref: "v3.4.1",
    },
    packages: [
      {
        // The date port (packages/i18n/src/date.ts today) cites
        // `ext/date/date_core.c` / `ext/date/date_parse.c` by line
        // throughout, so the C sources have to be readable in-tree.
        // `libPath: "lib"` covers `lib/date.rb` — the Ruby-visible surface
        // api-compare would extract once it is enrolled.
        name: "date",
        libPath: "lib",
        testPath: "test/date",
        // Vendored-only: the gem's surface is implemented in C, so the Ruby
        // extractor sees almost nothing. Measured by RFC 0088-date-gem-port's
        // `date-c-source-extractor-decision` spike, running
        // `scripts/api-compare/extract-ruby-api.rb` against this `libPath`:
        // `date: 2 classes, 0 modules, 12 public methods (1 internal)` — all of
        // `lib/date.rb`'s `Date#infinite?` and the `:nodoc:` `Date::Infinity`,
        // against 2,805 lines of port. So `compareApi` stays off; the C sources
        // are a read-anchor, and they need no `UNPORTED_FILES` entry because
        // the extractor globs `**/*.rb` and never sees them.
        compareApi: false,
        // `test/date/` is the gate for this cluster — 12 files, 145 `def test_`
        // methods — and it is the only fidelity measure the date port has:
        // per RFC 0088 the gem's test suite is the measure, not a
        // method-by-method mirror of Ruby's internal representation.
        //
        // Assertion-value mismatches against these tests are EXPECTED and
        // BENIGN, not drift. RFC 0088 returns `Temporal` types by default where
        // Ruby returns `Date`/`DateTime`/`Time`, so a ported test whose Ruby
        // form asserts `assert_equal Date.new(2001,2,3), Date.parse("…")`
        // compares a `Temporal.PlainDate` on our side. `parity:test` matches on
        // test *names*, so the test still counts. Do not "converge" a
        // Temporal return back to a Ruby-shaped one to silence a value
        // mismatch — that reverses the RFC's headline decision.
      },
    ],
  },
  {
    name: "minitest",
    origin: {
      type: "git",
      url: "https://github.com/minitest/minitest.git",
      // The version scripts/parity/pipeline/schema/ruby/Gemfile.lock:32 pins.
      // Move this ref when that pin moves, so the `gem/path.rb:LINE` citations
      // in activesupport/src/testing/assertions.ts stay checkable.
      ref: "v5.27.0",
    },
    packages: [
      {
        name: "minitest",
        libPath: "lib/minitest",
        testPath: "test/minitest",
        // Vendored as a read-anchor only. api-compare/test-compare derive their
        // package list from this file and key each package to a TS workspace
        // dir (`packages/<name>/src`); minitest has no such package — the port
        // is a slice of `packages/activesupport/src/testing/assertions.ts` —
        // so enrolling it would compare against a directory that does not
        // exist. Whether the comparator can be taught to map a non-Rails gem
        // onto a foreign file, and the `@noRailsEquivalent PERMANENT` tags on
        // those members then dropped, is its own story (RFC 0098).
        compareApi: false,
        compareTests: false,
      },
    ],
  },
  {
    name: "ruby",
    origin: {
      type: "git",
      url: "https://github.com/ruby/ruby.git",
      // The MRI interpreter, vendored as the read-anchor for the ruby-compat
      // ports that cite C source by symbol (`rational.c`, `range.c`, `re.c`,
      // `object.c` — see vendor/README.md for the call sites).
      //
      // Deliberately NOT the newest ref. The anchor has to be the build the
      // existing citations were written against, and moving to the current
      // stable (v3_4_10) rewrites the very files they point at: measured
      // `git diff v3_3_11 v3_4_10 -- rational.c range.c re.c object.c` is
      // +581/-285. The host toolchain is `ruby 3.3.11 (2026-03-26 revision
      // 1f2d15125a)` — the SHA this ref resolves to — and
      // `packages/date/src/date.ts:1229-1231` writes its behavioural claim as
      // "on ruby 3.3.11 `(Rational(1,2) * 12).class` is `Rational`".
      //
      // `.github/workflows/ci.yml:1413,1686,1799` pin `ruby-version: "3.3"`,
      // which floats to the newest patch on that line (v3_3_12 today) rather
      // than to .11 — so it constrains the LINE, not the patch. That is not a
      // gap: v3_3_12 is byte-identical to v3_3_11 across all four cited files,
      // so the two are interchangeable for this anchor and .11 wins only as
      // the revision the host and the date port name.
      //
      // The `date` gem above keeps its own `v3.4.1` ref: interpreter and gem
      // refs move independently.
      ref: "v3_3_11",
    },
    packages: [
      {
        // Keyed to the TS package it measures — `packages/ruby-compat/src` —
        // not to the source name, because the test comparator maps a package
        // key onto a TS src dir (scripts/test-compare/compare.ts pkgDirs).
        name: "ruby-compat",
        // The cited C lives at the repo root, which has no `libPath` shape;
        // `lib` is the Ruby-visible stdlib, and is what verifyPackages checks
        // the clone actually laid down.
        libPath: "lib",
        // ruby/ruby mirrors the ruby/spec suite in-tree, so this one source
        // serves both the C read-anchor and the behavioural suite RFC
        // 0129-ruby-compat measures ruby-compat with — no separate `ruby/spec`
        // clone (which RFC 0089 had planned).
        //
        // Scoped inside the extractor to the surface ruby-compat actually
        // ports (`RUBY_COMPAT_SPECS` in
        // scripts/test-compare/extract-ruby-tests.rb). The narrowing is
        // deliberate: all of `spec/ruby` is thousands of test names for
        // language and library surface ruby-compat has no port of, which would
        // drown the compare output.
        //
        // The unit is the MEMBER, never the directory. ruby-compat ports no
        // type whole — `Hash` is 16 of ruby/spec's 69 files, `Range` 13 of 30,
        // `Rational` 14 of 33, `Comparable` 6 of 7 — so taking a directory
        // presents test names for members the package deliberately does not
        // have (`Comparable#clamp`, `Rational#abs`, `Hash#dig`, `Range#step`),
        // which is the suite driving surface into the package.
        //
        // `testPath` is the suite ROOT, not `core/`, because the scoping is the
        // selection's job and a member spec's shared body sits in either
        // `core/<type>/shared/` or the suite-level `shared/<type>/` — all of
        // Rational's are in the latter, which `spec/ruby/core` could not see.
        //
        // The map grows with the package: a newly ported member adds its name.
        //
        // An unported spec here is NOT a reason to port the member it covers.
        // ruby-compat's surface is driven by what the trails packages need
        // from Ruby, and the standing rule wins over suite coverage: a spec
        // for a member ruby-compat deliberately does not have is a spec that
        // is out of scope, not a gap. Scoping the measure to the ported
        // surface is what keeps that rule enforceable rather than aspirational.
        //
        // Name mapping: ruby/spec files are mspec, which is RSpec-shaped
        // (`describe "Rational#abs" do` / `it "..." do`) rather than minitest
        // `def test_`, so the `def_test` name mapping the gem suites use does
        // not apply. extract-ruby-tests.rb already handles describe/it as its
        // Minitest::Spec style, so the description string IS the test name on
        // both sides and no mapping is needed.
        testPath: "spec/ruby",
        // Vendored as a read-anchor only, the way `date` above is. MRI's
        // surface is C, so `scripts/api-compare/extract-ruby-api.rb` — which
        // globs `**/*.rb` — extracts nothing from the files every citation
        // points at. `compareApi` stays off permanently; no later story flips
        // it.
        compareApi: false,
      },
    ],
  },
  {
    name: "i18n",
    origin: {
      type: "git",
      url: "https://github.com/ruby-i18n/i18n.git",
      ref: "v1.14.8",
    },
    packages: [
      {
        name: "i18n",
        libPath: "lib/i18n",
        testPath: "test",
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
 * Map of package name → absolute lib directory for every package with
 * `compareApi !== false`. Wave 6: feeds extract-ruby-api.rb via
 * `LIB_PATHS_JSON` env var so the Ruby script's PACKAGE_DIRS isn't a
 * hand-maintained map that drifts from SOURCES.
 */
export function libPathsManifest(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const source of SOURCES) {
    for (const pkg of source.packages) {
      if (pkg.compareApi === false) continue;
      out[pkg.name] = resolve(VENDOR_DIR, source.name, pkg.libPath);
    }
  }
  return out;
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
