import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

import {
  DIR_TO_PACKAGES,
  MANIFEST_PACKAGES,
  PACKAGE_DIRS,
  ROOT_DIR,
  isTestHelperFile,
} from "./config.js";

const manifestPath = path.join(ROOT_DIR, "eslint/rails-private-methods.json");
const manifest: { files: Record<string, string[]> } = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { files: {} };
const describeManifest = Object.keys(manifest.files).length > 0 ? describe : describe.skip;

describe("PACKAGE_DIRS", () => {
  it.each(MANIFEST_PACKAGES)("%s resolves to a directory that exists on disk", (pkg) => {
    const dir = PACKAGE_DIRS[pkg];
    expect(dir).toBeDefined();
    expect(fs.statSync(path.join(ROOT_DIR, dir)).isDirectory()).toBe(true);
  });

  it.each([
    ["actiondispatch", "packages/actionpack/src/action-dispatch"],
    ["actioncontroller", "packages/actionpack/src/action-controller"],
    ["abstractcontroller", "packages/actionpack/src/abstract-controller"],
    ["actionpackversion", "packages/actionpack/src/action-pack"],
    ["arel", "packages/arel/src"],
    ["trailties", "packages/trailties/src"],
  ])("spells %s's src dir the way the repo does", (pkg, dir) => {
    expect(PACKAGE_DIRS[pkg]).toBe(dir);
  });

  it("covers every api-compared package sharing the actionpack dir", () => {
    expect([...(DIR_TO_PACKAGES.actionpack ?? [])].sort()).toEqual(
      [...(DIR_TO_PACKAGES.actionpack ?? [])].filter((p) => p in PACKAGE_DIRS).sort(),
    );
  });

  it("covers exactly the manifest packages", () => {
    expect(Object.keys(PACKAGE_DIRS).sort()).toEqual([...MANIFEST_PACKAGES].sort());
  });
});

describeManifest("rails-private-methods manifest", () => {
  it("keys every entry under a package dir PACKAGE_DIRS knows", () => {
    const dirs = Object.values(PACKAGE_DIRS);
    const orphans = Object.keys(manifest.files).filter(
      (k) => !dirs.some((d) => k.startsWith(`${d}/`)),
    );
    expect(orphans).toEqual([]);
  });

  it.each([
    ["packages/actionpack/src/action-controller/base.ts", "contentSecurityPolicy"],
    [
      "packages/actionpack/src/action-controller/metal/content-security-policy.ts",
      "contentSecurityPolicy",
    ],
    ["packages/activemodel/src/attributes.ts", "attribute"],
  ])("does not claim %s's %s is Rails-private on a `?` sibling's candidate", (file, name) => {
    expect(manifest.files[file] ?? []).not.toContain(name);
  });
});

describe("isTestHelperFile", () => {
  it("excludes a package's own src/test-helpers tree", () => {
    expect(isTestHelperFile("test-helpers/uniq.ts")).toBe(true);
    expect(isTestHelperFile("test-helpers/models/post.ts")).toBe(true);
  });

  it("keeps a Rails directory the port mirrors under that name", () => {
    expect(isTestHelperFile("system-testing/test-helpers/screenshot-helper.ts")).toBe(false);
  });

  it("keeps an ordinary source file", () => {
    expect(isTestHelperFile("nodes/bound-sql-literal.ts")).toBe(false);
  });
});
