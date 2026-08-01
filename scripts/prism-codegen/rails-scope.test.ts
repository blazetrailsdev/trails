import { describe, it, expect } from "vitest";
import {
  mixinPathCandidates,
  parseMixinNames,
  reachableRailsDefs,
  resetUnresolvedMixins,
  resolveMixinPath,
  unresolvedMixinReport,
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
  "relation/finder_methods.rb": railsModule(
    "Relation::FinderMethods",
    "def find_by; end\ndef find; end",
  ),
  "relation/calculations.rb": railsModule(
    "Relation::Calculations",
    "def calculate; end\ndef pluck; end",
  ),
  "relation/query_methods.rb": railsModule("Relation::QueryMethods", "def where; end"),
  "relation/spawn_methods.rb": railsModule("Relation::SpawnMethods", "def merge; end"),
  "relation/batches.rb": railsModule("Relation::Batches", "def find_each; end"),
  "relation/explain.rb": railsModule("Relation::Explain", "def explain; end"),
  "relation/delegation.rb": railsModule("Delegation", "def klass; end"),
};

function railsModule(constPath: string, body: string): string {
  const segments = constPath.split("::");
  const opens = segments.map((name, depth) => `${"  ".repeat(depth + 1)}module ${name}`).join("\n");
  const indented = body
    .split("\n")
    .map((line) => `${"  ".repeat(segments.length + 1)}${line}`)
    .join("\n");
  const closes = segments.map((_, depth) => `${"  ".repeat(depth + 1)}end`).reverse();
  return ["module ActiveRecord", opens, indented, ...closes, "end"].join("\n");
}

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

  it("picks the lexically nearest file that really defines a same-named constant", () => {
    const sources: Record<string, string> = {
      "relation.rb": `
        module ActiveRecord
          class Relation
            include Calculations
          end
        end
      `,
      "relation/calculations.rb": railsModule("Relation::Calculations", "def pluck; end"),
      "calculations.rb": railsModule("Calculations", "def sum; end"),
    };
    const read: RubySourceReader = (rel) => sources[rel];
    expect(resolveMixinPath("relation.rb", "Calculations", read)).toBe("relation/calculations.rb");

    // Same constant name, but the nested file defines a different module: the
    // path guess would take it anyway, so resolution has to fall through.
    sources["relation/calculations.rb"] = railsModule("Relation::Batches", "def find_each; end");
    expect(resolveMixinPath("relation.rb", "Calculations", read)).toBe("calculations.rb");
  });

  it("resolves a nested constant to the file of the constant that encloses it", () => {
    const sources: Record<string, string> = {
      "query_cache.rb": railsModule("QueryCache::ClassMethods", "def cache; end"),
    };
    const read: RubySourceReader = (rel) => sources[rel];
    expect(resolveMixinPath("base.rb", "QueryCache::ClassMethods", read)).toBe("query_cache.rb");
  });

  it("reports a mixin constant no file in the corpus defines", () => {
    resetUnresolvedMixins();
    const read: RubySourceReader = () => undefined;
    expect(resolveMixinPath("relation.rb", "ActiveModel::AttributeMethods", read)).toBeUndefined();
    expect(unresolvedMixinReport()).toEqual([
      { fromRel: "relation.rb", moduleName: "ActiveModel::AttributeMethods" },
    ]);
    resetUnresolvedMixins();
    expect(unresolvedMixinReport()).toEqual([]);
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
