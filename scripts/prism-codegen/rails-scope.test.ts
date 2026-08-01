import { describe, it, expect } from "vitest";
import { mixinPathCandidates, parseMixinNames, reachableRailsDefs } from "./rails-scope.js";
import {
  asyncMethodsForRailsFile,
  buildAsyncManifest,
  crossFileAsyncNames,
} from "./async-source.js";

describe("prism-codegen rails scope", () => {
  it("reads the include/extend constants out of a Ruby source", () => {
    const names = parseMixinNames(`
      class Relation
        include Enumerable
        include FinderMethods, Calculations
        extend ActiveRecord::Delegation::DelegateCache
        included_modules
      end
    `);
    expect(names).toEqual([
      "Enumerable",
      "FinderMethods",
      "ActiveRecord::Delegation::DelegateCache",
    ]);
  });

  it("offers the nested, sibling and root layouts for a mixin constant", () => {
    expect(mixinPathCandidates("active_record/relation.rb", "FinderMethods")).toEqual([
      "relation/finder_methods.rb",
      "finder_methods.rb",
    ]);
    expect(
      mixinPathCandidates("active_record/relation/query_methods.rb", "ActiveRecord::Core"),
    ).toEqual(["relation/query_methods/core.rb", "relation/core.rb", "core.rb"]);
  });

  it("reaches the defs of the modules a Rails file includes", () => {
    const relation = reachableRailsDefs("active_record/relation.rb");
    expect(relation.has("findBy")).toBe(true);
    expect(relation.has("pluck")).toBe(true);
    expect(reachableRailsDefs("active_record/relation/finder_methods.rb").has("pluck")).toBe(false);
  });

  it("declines a cross-file async name the generating Rails file cannot dispatch to", () => {
    const manifest = buildAsyncManifest([
      { path: "relation/calculations.ts", source: `class C { async pluck() {} }` },
    ]);
    const scoped = (railsRelPath: string, twinTsPath: string) =>
      crossFileAsyncNames(manifest, { twinTsPath, railsDefs: reachableRailsDefs(railsRelPath) });
    expect(scoped("active_record/relation.rb", "relation.ts").has("pluck")).toBe(true);
    expect(
      scoped("active_record/relation/finder_methods.rb", "relation/finder-methods.ts").has("pluck"),
    ).toBe(false);
  });

  it("keeps a name async where Rails defines it and sync where it does not", () => {
    expect(asyncMethodsForRailsFile("active_record/relation/calculations.rb").has("pluck")).toBe(
      true,
    );
    expect(asyncMethodsForRailsFile("active_record/relation/finder_methods.rb").has("pluck")).toBe(
      false,
    );
  });
});
