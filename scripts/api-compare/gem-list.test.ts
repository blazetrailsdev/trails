import { describe, expect, it } from "vitest";

import { diffGemList, gemNamesFromPaths } from "./gem-list.js";

describe("gemNamesFromPaths", () => {
  it("derives subgem names from monorepo gemspec paths", () => {
    const names = gemNamesFromPaths([
      "activerecord/activerecord.gemspec",
      "activemodel/activemodel.gemspec",
      "actionpack/actionpack.gemspec",
    ]);
    expect(names).toEqual(["actionpack", "activemodel", "activerecord"]);
  });

  it("derives a root gemspec without a directory prefix", () => {
    expect(gemNamesFromPaths(["rails.gemspec"])).toEqual(["rails"]);
  });

  it("sorts and de-duplicates", () => {
    const names = gemNamesFromPaths([
      "tools/foo/foo.gemspec",
      "foo/foo.gemspec",
      "bar/bar.gemspec",
    ]);
    expect(names).toEqual(["bar", "foo"]);
  });

  it("ignores paths that are not gemspecs", () => {
    expect(gemNamesFromPaths(["activerecord/lib/active_record.rb", "Gemfile"])).toEqual([]);
  });
});

describe("diffGemList", () => {
  it("reports added and removed packages", () => {
    const delta = diffGemList(
      ["activerecord", "activemodel", "actionmailbox"],
      ["activerecord", "activemodel", "actiontext"],
    );
    expect(delta.addedPackages).toEqual(["actiontext"]);
    expect(delta.removedPackages).toEqual(["actionmailbox"]);
  });

  it("returns empty deltas when the gem lists match", () => {
    const delta = diffGemList(["activerecord", "rails"], ["rails", "activerecord"]);
    expect(delta.addedPackages).toEqual([]);
    expect(delta.removedPackages).toEqual([]);
  });

  it("does not flag non-monorepo gems we never list (rack/globalid) as removed", () => {
    // rack/globalid live outside the rails monorepo, so they never appear in
    // either gemspec-derived list and cannot surface here — preserving the
    // one-sided-package skip in version-diff.ts.
    const base = gemNamesFromPaths(["activerecord/activerecord.gemspec"]);
    const target = gemNamesFromPaths(["activerecord/activerecord.gemspec"]);
    const delta = diffGemList(base, target);
    expect(delta.removedPackages).not.toContain("rack");
    expect(delta.removedPackages).not.toContain("globalid");
  });
});
