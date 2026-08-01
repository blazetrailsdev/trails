import { describe, it, expect } from "vitest";
import {
  mixinPathCandidates,
  parseMixinNames,
  reachableRailsDefs,
  type RubySourceReader,
} from "./rails-scope.js";
import { buildAsyncManifest, crossFileAsyncNames } from "./async-source.js";

/**
 * Rails' own layout, trimmed to the shape that matters: `relation.rb` mixes in
 * seven modules on one `include` line (relation.rb:68), and `finder_methods.rb`
 * mixes in nothing.
 */
const RAILS: Record<string, string> = {
  "relation.rb": `
    module ActiveRecord
      class Relation
        include Enumerable
        include FinderMethods, Calculations, SpawnMethods, QueryMethods, Batches, Explain, Delegation
        def scoping; end
      end
    end
  `,
  "relation/finder_methods.rb": `def find_by; end\ndef find; end`,
  "relation/calculations.rb": `def calculate; end\ndef pluck; end`,
  "relation/query_methods.rb": `def where; end`,
  "relation/spawn_methods.rb": `def merge; end`,
  "relation/batches.rb": `def find_each; end`,
  "relation/explain.rb": `def explain; end`,
  "relation/delegation.rb": `def klass; end`,
};

const reader: RubySourceReader = (rel) => RAILS[rel];

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
      "Calculations",
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

  it("reaches the defs of every module a Rails file includes", () => {
    const relation = reachableRailsDefs("active_record/relation.rb", reader);
    expect(relation.has("scoping")).toBe(true);
    expect(relation.has("findBy")).toBe(true);
    expect(relation.has("calculate")).toBe(true);
    expect(relation.has("where")).toBe(true);
    expect(relation.has("merge")).toBe(true);
    expect(relation.has("findEach")).toBe(true);

    const finderMethods = reachableRailsDefs("active_record/relation/finder_methods.rb", reader);
    expect(finderMethods.has("find")).toBe(true);
    expect(finderMethods.has("where")).toBe(false);
    expect(finderMethods.has("pluck")).toBe(false);
  });

  it("declines a cross-file async name the generating Rails file cannot dispatch to", () => {
    const manifest = buildAsyncManifest([
      { path: "relation/calculations.ts", source: `class C { async pluck() {} }` },
    ]);
    const scoped = (railsRelPath: string, twinTsPath: string) =>
      crossFileAsyncNames(manifest, {
        twinTsPath,
        railsDefs: reachableRailsDefs(railsRelPath, reader),
      });
    expect(scoped("active_record/relation.rb", "relation.ts").has("pluck")).toBe(true);
    expect(
      scoped("active_record/relation/finder_methods.rb", "relation/finder-methods.ts").has("pluck"),
    ).toBe(false);
  });
});
