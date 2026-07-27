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

/** Override package → directory mapping when they differ */
export const PACKAGE_DIR_OVERRIDES: Record<string, string> = {
  actiondispatch: "actionpack",
  actioncontroller: "actionpack",
  abstractcontroller: "actionpack",
  actionpackversion: "actionpack",
};

/**
 * Inverse of PACKAGE_DIR_OVERRIDES: directory name → api-compare package keys.
 * Derived automatically so the two maps can't drift.
 * Used when resolving an npm dep name (e.g. `@blazetrails/actionpack`) to the
 * logical package keys used in the TS manifest.
 */
export const DIR_TO_PACKAGES: Record<string, string[]> = Object.entries(
  PACKAGE_DIR_OVERRIDES,
).reduce<Record<string, string[]>>((acc, [pkg, dir]) => {
  (acc[dir] ??= []).push(pkg);
  return acc;
}, {});

/** Override package → src subdirectory when package shares a dir */
export const PACKAGE_SRC_SUBDIR: Record<string, string> = {
  actiondispatch: "action-dispatch",
  actioncontroller: "action-controller",
  abstractcontroller: "abstract-controller",
  actionpackversion: "action-pack",
};

/** A package's extraction roots, as the freshness guards need them. */
export interface PackageRoots {
  /** Directory name under `packages/` — several packages can share one. */
  dir: string;
  /** Exactly the tree the extractor compiles (`packageSrcDir`). */
  srcDir: string;
  /** The declarations siblings resolve this package's imports through. */
  distDir: string;
}

/**
 * The extraction roots of every package `api:compare` actually extracts.
 *
 * Derived from `PACKAGES` rather than a `packages/` listing so the freshness
 * guards see the same tree the extractor does: workspaces that are not
 * api-compared (`activerecord-cli`, `trails-tsc`, `tse-compiler`, `website`, …)
 * cannot affect the TS manifest and so must not be able to block a run.
 */
export function apiComparePackageRoots(): PackageRoots[] {
  return PACKAGES.map((pkg) => {
    const dir = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
    return {
      dir,
      srcDir: packageSrcDir(pkg),
      distDir: path.join(ROOT_DIR, "packages", dir, "dist"),
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
