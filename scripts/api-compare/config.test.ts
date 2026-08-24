import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "vitest";

import { MANIFEST_PACKAGES, PACKAGE_DIRS, ROOT_DIR, packageSrcDir } from "./config.js";

describe("PACKAGE_DIRS", () => {
  // The regression this guards: the map used to be hand-copied into
  // scripts/build-rails-privates-manifest.ts, where it spelled
  // `actiondispatch` / `actioncontroller` against the real `action-dispatch` /
  // `action-controller`. Every actionpack key in
  // eslint/rails-private-methods.json then pointed at a path that does not
  // exist, so `rails-private-jsdoc` silently matched nothing for the whole
  // package. A dead key is indistinguishable from "Rails privatises nothing
  // here", which is why this asserts the DIRECTORY exists rather than
  // asserting anything about the manifest's keys — most of those legitimately
  // name Rails files trails has not ported yet.
  it.each(MANIFEST_PACKAGES)("%s resolves to a directory that exists", (pkg) => {
    const dir = PACKAGE_DIRS[pkg];
    expect(dir).toBeDefined();
    expect(fs.statSync(path.join(ROOT_DIR, dir)).isDirectory()).toBe(true);
  });

  it("covers exactly the manifest packages", () => {
    expect(Object.keys(PACKAGE_DIRS).sort()).toEqual([...MANIFEST_PACKAGES].sort());
  });

  it("agrees with packageSrcDir", () => {
    for (const pkg of MANIFEST_PACKAGES) {
      expect(path.join(ROOT_DIR, PACKAGE_DIRS[pkg])).toBe(packageSrcDir(pkg));
    }
  });
});

// `eslint/rails-private-methods.json` is gitignored and built only by the
// Ruby-bearing `rails-comparison` CI job; `railsApiAvailable` also writes an
// EMPTY one when rails-api.json is absent. Either way there is nothing to
// assert, so skip rather than red every other job.
const manifestPath = path.join(ROOT_DIR, "eslint/rails-private-methods.json");
const manifest: { files: Record<string, string[]> } = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : { files: {} };
const describeManifest = Object.keys(manifest.files).length > 0 ? describe : describe.skip;

describeManifest("rails-private-methods manifest", () => {
  it("has no key under a package dir that does not exist", () => {
    const dirs = Object.values(PACKAGE_DIRS);
    const dead = Object.keys(manifest.files).filter(
      (k) => !dirs.some((d) => k.startsWith(`${d}/`)),
    );
    expect(dead).toEqual([]);
  });

  // `rubyMethodToTs` gives a `?` method the bare stem as a candidate, so a
  // private `content_security_policy?` used to contribute `contentSecurityPolicy`
  // — the spelling of the PUBLIC `content_security_policy` class DSL beside it —
  // and `rails-private-jsdoc` then demanded `@internal` on a public Rails method.
  // The all-private guard runs on Ruby names and cannot see that collision; the
  // builder subtracts every `mixed` name's candidates to close it.
  it.each([
    ["packages/actionpack/src/action-controller/base.ts", "contentSecurityPolicy"],
    [
      "packages/actionpack/src/action-controller/metal/content-security-policy.ts",
      "contentSecurityPolicy",
    ],
    ["packages/activemodel/src/attributes.ts", "attribute"],
  ])("%s does not claim %s is Rails-private", (file, name) => {
    expect(manifest.files[file] ?? []).not.toContain(name);
  });
});
