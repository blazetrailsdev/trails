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
