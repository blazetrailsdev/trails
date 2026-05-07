import * as path from "path";

export const SCRIPT_DIR = __dirname;
export const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
export const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

export const PACKAGES = [
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
  "actionview",
  "trailties",
];

/** Override package → directory mapping when they differ */
export const PACKAGE_DIR_OVERRIDES: Record<string, string> = {
  actiondispatch: "actionpack",
  actioncontroller: "actionpack",
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
  actiondispatch: "actiondispatch",
  actioncontroller: "actioncontroller",
};

export function packageSrcDir(pkg: string): string {
  const dirName = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
  const subDir = PACKAGE_SRC_SUBDIR[pkg];
  return subDir
    ? path.join(ROOT_DIR, "packages", dirName, "src", subDir)
    : path.join(ROOT_DIR, "packages", dirName, "src");
}
