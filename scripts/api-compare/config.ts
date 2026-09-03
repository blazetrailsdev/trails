import * as path from "path";

import { apiComparePackages } from "../../vendor/sources.js";

export const SCRIPT_DIR = __dirname;
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
export const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

/**
 * Derived from vendor/sources.ts (single source of truth). Package entries
 * with `compareApi: false` are filtered out — vendored for test-compare
 * but excluded from api-compare. The flag exists for cases where the
 * extractor can't yet handle a gem's idioms; today no source sets it.
 */
export const PACKAGES = apiComparePackages();

/**
 * Packages the TS extractor reads but the Rails comparison never scores: they
 * have no gem on the other side, so coverage, arity and call parity over them
 * are meaningless questions.
 *
 * `ruby-compat` is a port of Ruby, not of Rails (RFC 0129), and its README
 * states plainly that `parity:api` never enrolls it — permanently. It is here
 * only so `parity:api:extra` can COUNT it: every TS file in it lands in the
 * `rubyFile === null` slice, so every public name scores novel, which makes the
 * extra-surface mark an exact measure of how much MRI surface has been ported.
 * That count is what enforces the package's "only what trails actually calls"
 * rule mechanically instead of by review.
 *
 * Deliberately NOT folded into {@link PACKAGES}: that list is the Rails-parity
 * population, and adding a Ruby port to it would put a package with no gem into
 * every coverage denominator in the repo.
 */
export const TS_ONLY_PACKAGES = ["ruby-compat"] as const;

/** Every package `extract-ts-api.ts` walks: the Rails population plus the Ruby ports. */
export const TS_EXTRACT_PACKAGES: readonly string[] = [...PACKAGES, ...TS_ONLY_PACKAGES];

/** Override package → directory mapping when they differ */
export const PACKAGE_DIR_OVERRIDES: Record<string, string> = {
  actiondispatch: "actionpack",
  actioncontroller: "actionpack",
  abstractcontroller: "actionpack",
  actionpackversion: "actionpack",
  "activerecord-test-support": "activerecord",
};

/**
 * Inverse of PACKAGE_DIR_OVERRIDES: directory name → api-compare package keys.
 * Derived automatically so the two maps can't drift.
 * Used when resolving an npm dep name (e.g. `@blazetrails/actionpack`) to the
 * logical package keys used in the TS manifest.
 */
export const DIR_TO_PACKAGES: Record<string, string[]> = Object.entries(
  PACKAGE_DIR_OVERRIDES,
).reduce<Record<string, string[]>>(
  (acc, [pkg, dir]) => {
    (acc[dir] ??= []).push(pkg);
    return acc;
  },
  // A dir can host both a package of its own name and overriding pseudo-packages
  // (`activerecord` + `activerecord-test-support`); seed the self-mapping so
  // resolving the npm dep `@blazetrails/activerecord` doesn't lose `activerecord`.
  Object.fromEntries(
    PACKAGES.filter((pkg) => !PACKAGE_DIR_OVERRIDES[pkg]).map((pkg) => [pkg, [pkg]]),
  ),
);

/**
 * Packages that pair against a framework's *test* helpers rather than its lib.
 * They live inside another package's src dir and are not part of anyone's
 * dependency surface, so `blazetrailsDepKeys` filters them out of sibling
 * packages' entity index — a Rails lib method must never satisfy its
 * inheritance/arity lookup against a test helper.
 */
export const TEST_SUPPORT_PACKAGES = new Set(["activerecord-test-support"]);

/**
 * A `packages/<pkg>/src/test-helpers/**` file — test support with no Rails
 * counterpart, the way `src/support/**` sits outside both compare populations
 * (see {@link TEST_SUPPORT_PACKAGES}).
 *
 * The call-set and call-argument gates resolve a Ruby callee name by asking
 * whether that name is a ported method taking arguments anywhere in the package
 * (compare.ts#resolvePortedWithArgsSigs), so a helper standing in for a Ruby
 * core method puts its name into that population and makes UNRELATED source
 * files flag. Observed in PR #7015: adding `arel/src/test-helpers/uniq.ts` — the
 * sibling of `must-be-like.ts` — surfaced a new `uniq` row on
 * `nodes/bound-sql-literal.ts`, a file nothing had changed, whose port spells
 * `bound_sql_literal.rb:20-21`'s dedupe as `[...new Set(...)]`.
 *
 * Matched on the FIRST path segment only — the extractor's file keys are
 * relative to the package src dir, and `test-helpers` at depth is a Rails
 * directory the port mirrors (`action_dispatch/system_testing/test_helpers/`),
 * not trails test support.
 */
export function isTestHelperFile(file: string): boolean {
  return file.split(/[/\\]/)[0] === "test-helpers";
}

/** Override package → src subdirectory when package shares a dir */
export const PACKAGE_SRC_SUBDIR: Record<string, string> = {
  actiondispatch: "action-dispatch",
  actioncontroller: "action-controller",
  abstractcontroller: "abstract-controller",
  actionpackversion: "action-pack",
  "activerecord-test-support": "support",
};

/**
 * Src dirs of the packages nested inside `pkg`'s own src dir. The container's
 * extraction walk skips them so each file lands in exactly one package manifest
 * (`activerecord` must not also extract `src/support/`, which belongs to
 * `activerecord-test-support`).
 *
 * Actionpack's four packages are siblings under `src/`, with no package rooted
 * at `src/` itself, so nothing is excluded there.
 */
export function overlappingSubDirs(pkg: string): string[] {
  const own = packageSrcDir(pkg);
  return PACKAGES.filter((other) => other !== pkg)
    .map(packageSrcDir)
    .filter((dir) => dir.startsWith(own + path.sep));
}

/** A package's extraction roots, as the freshness guards need them. */
export interface PackageRoots {
  /** Directory name under `packages/` — several packages can share one. */
  dir: string;
  /** Exactly the tree the extractor compiles (`packageSrcDir`). */
  srcDir: string;
  /** The declarations siblings resolve this package's imports through. */
  distDir: string;
  /** The project `tsc --build` compiles — the freshness guard's oracle. */
  configPath: string;
}

/**
 * The extraction roots of every package `parity:api` actually extracts.
 *
 * Derived from `TS_EXTRACT_PACKAGES` rather than a `packages/` listing so the
 * freshness guards see the same tree the extractor does: workspaces that are not
 * api-compared (`activerecord-cli`, `trails-tsc`, `tse-compiler`, `website`, …)
 * cannot affect the TS manifest and so must not be able to block a run.
 */
export function apiComparePackageRoots(): PackageRoots[] {
  return TS_EXTRACT_PACKAGES.map((pkg) => {
    const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    return {
      dir,
      srcDir: packageSrcDir(pkg),
      distDir: path.join(ROOT_DIR, "packages", dir, "dist"),
      configPath: path.join(ROOT_DIR, "packages", dir, "tsconfig.json"),
    };
  });
}

export function packageSrcDir(pkg: string): string {
  const dirName = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
  const subDir = PACKAGE_SRC_SUBDIR[pkg];
  return subDir
    ? path.join(ROOT_DIR, "packages", dirName, "src", subDir)
    : path.join(ROOT_DIR, "packages", dirName, "src");
}

/**
 * The api-compare packages `scripts/build-rails-privates-manifest.ts` projects
 * Rails visibility onto — every api-compared package of a Rails framework,
 * actionpack's four included, plus the four gem ports whose gem source is
 * vendored and extracted (`rack`, `rack-session`, `globalid`, `i18n`,
 * `did-you-mean`).
 *
 * This is `PACKAGES` in full: a package is projectable exactly when the Ruby
 * extractor runs over its vendored source, which is what `compareApi !== false`
 * already means. The ports with no Ruby side at all are listed in
 * `PACKAGES_OUTSIDE_MANIFEST`.
 */
export const MANIFEST_PACKAGES = [
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
  "abstractcontroller",
  "actionpackversion",
  "actionview",
  "trailties",
  "rack",
  "rack-session",
  "rack-test",
  "globalid",
  "i18n",
  "did-you-mean",
] as const;

/**
 * Ports permanently outside `eslint/rails-private-methods.json`, because there
 * is no Ruby source the privates projection can run over:
 *
 * - `date` — vendored, but `compareApi: false` (vendor/sources.ts): the Ruby
 *   `Date`/`DateTime` surface lives in C (`ext/date/date_core.c`), so the
 *   extractor sees no method visibilities to project.
 * - `html-sanitizer`, `activerecord-cli` — not vendored sources at all; they
 *   have no gem counterpart in `vendor/`.
 *
 * A rule that demands a `@noRailsEquivalent` receipt for an `@internal` tag
 * with no manifest backing MUST subtract these: for them "no Rails counterpart"
 * and "not covered by the manifest" are the same state, so it has no basis to
 * ask.
 */
export const PACKAGES_OUTSIDE_MANIFEST = ["date", "html-sanitizer", "activerecord-cli"] as const;

/**
 * Manifest package → repo-relative POSIX src dir, derived from `packageSrcDir`
 * rather than hand-copied in the manifest builder. It lives here so the two can
 * never drift: the builder's own copy spelled `actiondispatch` /
 * `actioncontroller` against the real `action-dispatch` / `action-controller`,
 * which voided every actionpack key in `eslint/rails-private-methods.json` and
 * with it the `rails-private-jsdoc` rule for the whole package.
 *
 * Forward slashes because the ESLint rule looks entries up by
 * `path.relative(...).split(path.sep).join("/")`.
 */
export const PACKAGE_DIRS: Record<string, string> = Object.fromEntries(
  MANIFEST_PACKAGES.map((pkg) => [
    pkg,
    path.relative(ROOT_DIR, packageSrcDir(pkg)).split(path.sep).join("/"),
  ]),
);
