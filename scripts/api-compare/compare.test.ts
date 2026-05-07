import { describe, it, expect } from "vitest";
import {
  nameMatches,
  superclassesMatch,
  resolveTsClassForRuby,
  methodInMode,
  tsShouldIncludeInIndex,
  flattenIncludedMethodInfos,
  resolveModuleName,
  dedupeRubyMethodInto,
  selectMisplacedFile,
  MISPLACED_MIN_HITS,
  buildEntitiesByName,
} from "./compare.js";
import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "./types.js";

function cls(file: string, name: string, superclass?: string): ClassInfo {
  return {
    file,
    name,
    superclass,
    includes: [],
    extends: [],
    instanceMethods: [],
    classMethods: [],
  };
}

function method(name: string): MethodInfo {
  return { name, visibility: "public", params: [] };
}

function makeManifest(
  packages: Record<
    string,
    { classes?: Record<string, ClassInfo>; modules?: Record<string, ClassInfo> }
  >,
): ApiManifest {
  const result: ApiManifest = { source: "typescript", generatedAt: "", packages: {} };
  for (const [pkg, p] of Object.entries(packages)) {
    result.packages[pkg] = { classes: p.classes ?? {}, modules: p.modules ?? {} };
  }
  return result;
}

describe("nameMatches", () => {
  it("matches identical names", () => {
    expect(nameMatches("Binary", "Binary")).toBe(true);
  });

  it("matches Ruby error builtins against JS Error", () => {
    expect(nameMatches("StandardError", "Error")).toBe(true);
    expect(nameMatches("ArgumentError", "Error")).toBe(true);
    expect(nameMatches("RangeError", "Error")).toBe(true);
  });

  it("does not match a Ruby non-builtin error name against JS Error", () => {
    expect(nameMatches("ConfigurationError", "Error")).toBe(false);
    expect(nameMatches("ActiveRecordError", "Error")).toBe(false);
  });

  describe("Trails rename conventions", () => {
    it("accepts Abstract<X> (import alias for shadowed parents)", () => {
      // `TableDefinition as AbstractTableDefinition` when a subclass
      // shadows the parent's name.
      expect(nameMatches("TableDefinition", "AbstractTableDefinition")).toBe(true);
      expect(nameMatches("SchemaCreation", "AbstractSchemaCreation")).toBe(true);
    });

    it("accepts Base<X> (intermediate base layer)", () => {
      // Rails has a single class; Trails splits it (BaseLogSubscriber +
      // LogSubscriber, BaseAbsenceValidator + AbsenceValidator, ...).
      expect(nameMatches("LogSubscriber", "BaseLogSubscriber")).toBe(true);
      expect(nameMatches("AbsenceValidator", "BaseAbsenceValidator")).toBe(true);
    });

    it("accepts ActiveModel<X> (aliased to avoid JS builtin collision)", () => {
      // Our Date type extends ActiveModel's Date, aliased on import
      // because the identifier `Date` in the TS file refers to this class.
      expect(nameMatches("Date", "ActiveModelDate")).toBe(true);
      expect(nameMatches("DateTime", "ActiveModelDateTime")).toBe(true);
      expect(nameMatches("Time", "ActiveModelTime")).toBe(true);
    });

    it("accepts <X>Type (suffix to distinguish value vs cast type)", () => {
      // Rails's `Type::Json` value type; our TS class is `JsonType` so
      // the file can still export `Json` as the value constructor.
      expect(nameMatches("Json", "JsonType")).toBe(true);
      expect(nameMatches("Integer", "IntegerType")).toBe(true);
      expect(nameMatches("Binary", "BinaryType")).toBe(true);
    });

    it("rejects unrelated names that happen to share a prefix/suffix", () => {
      // "FooBar" isn't "Abstract" / "Base" / "ActiveModel" + rubyName,
      // nor rubyName + "Type".
      expect(nameMatches("Foo", "FooBar")).toBe(false);
      expect(nameMatches("Foo", "BarFoo")).toBe(false);
    });
  });
});

describe("superclassesMatch", () => {
  it("treats empty ruby super + empty ts chain as matched", () => {
    expect(superclassesMatch(null, [], "Anything")).toBe(true);
  });

  it("flags ruby super with empty ts chain", () => {
    expect(superclassesMatch("Foo", [], "Anything")).toBe(false);
  });

  it("matches when ruby super appears anywhere in the ts chain", () => {
    expect(superclassesMatch("Binary", ["Binary"], "Cte")).toBe(true);
    // Trails adds an abstract intermediate; the Ruby parent still
    // shows up in the ts chain.
    expect(
      superclassesMatch("TableDefinition", ["AbstractTableDefinition"], "TableDefinition"),
    ).toBe(true);
  });

  it("matches when ts chain contains a deeper ancestor equal to ruby super", () => {
    // Binary extends NodeExpression extends Node; Rails parent is Binary.
    expect(superclassesMatch("Binary", ["Binary", "NodeExpression", "Node"], "Cte")).toBe(true);
  });

  it("accepts Ruby unextendable builtins regardless of ts chain", () => {
    // Rails SqlLiteral < String — TS can't extend String, but the check
    // still counts it as matched.
    expect(superclassesMatch("String", ["Node", "NodeExpression"], "SqlLiteral")).toBe(true);
    expect(superclassesMatch("Struct", [], "Attribute")).toBe(true);
    // Ruby's `Module` metaprogramming primitive has no TS analog.
    expect(superclassesMatch("Module", [], "InstanceMethodsOnActivation")).toBe(true);
  });

  it("accepts arel Table/Attribute extending Node when Ruby has no super", () => {
    expect(superclassesMatch(null, ["Node"], "Table")).toBe(true);
    expect(superclassesMatch(null, ["Node"], "Attribute")).toBe(true);
  });

  it("accepts activemodel ValueType extending Type when Ruby Value has no super", () => {
    // Rails' `Type::Value` has no super; TS adds an abstract `Type`
    // intermediate so subclasses can declare `abstract cast`.
    expect(superclassesMatch(null, ["Type"], "ValueType")).toBe(true);
  });

  it("accepts AR Base extending Model when Ruby Base has no super", () => {
    // `ActiveRecord::Base` has no Ruby super; TS `Base extends Model`
    // to expose the ActiveModel host class on subclasses.
    expect(superclassesMatch(null, ["Model"], "Base")).toBe(true);
  });

  it("does not auto-accept other classes extending the intermediates with null Ruby super", () => {
    // Only the whitelisted (tsName, intermediate) pairs above are accepted.
    expect(superclassesMatch(null, ["Node"], "Something")).toBe(false);
    expect(superclassesMatch(null, ["Type"], "Something")).toBe(false);
    expect(superclassesMatch(null, ["Model"], "Something")).toBe(false);
  });
});

describe("resolveTsClassForRuby", () => {
  const file = "type/integer.ts";

  it("returns the direct-name match when it has a superclass", () => {
    const direct = cls(file, "Integer", "Value");
    const map = new Map([[`${file}::Integer`, direct]]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(direct);
  });

  it("falls back to an alias match when the direct name is absent", () => {
    const aliased = cls(file, "IntegerType", "ValueType");
    const map = new Map([[`${file}::IntegerType`, aliased]]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(aliased);
  });

  it("prefers an alias match with a super over a direct match without one", () => {
    // Mirrors oid/range.ts: `Range` is a bare bounds helper (no super);
    // `RangeType extends ValueType<Range>` is the real OID cast type.
    const direct = cls("oid/range.ts", "Range"); // no super
    const alias = cls("oid/range.ts", "RangeType", "ValueType");
    const map = new Map([
      ["oid/range.ts::Range", direct],
      ["oid/range.ts::RangeType", alias],
    ]);
    expect(resolveTsClassForRuby("Range", "oid/range.ts", map)).toBe(alias);
  });

  it("keeps the direct match when it has a super, even if an alias also exists", () => {
    const direct = cls(file, "Integer", "Value");
    const alias = cls(file, "IntegerType", "ValueType");
    const map = new Map([
      [`${file}::Integer`, direct],
      [`${file}::IntegerType`, alias],
    ]);
    expect(resolveTsClassForRuby("Integer", file, map)).toBe(direct);
  });

  it("honors TS_CLASS_RENAMES when neither direct nor alias match (e.g. Registry → TypeRegistry)", () => {
    const renamed = cls("type/registry.ts", "TypeRegistry");
    const map = new Map([["type/registry.ts::TypeRegistry", renamed]]);
    expect(resolveTsClassForRuby("Registry", "type/registry.ts", map)).toBe(renamed);
  });

  it("returns undefined when nothing resolves", () => {
    expect(resolveTsClassForRuby("Nothing", "nowhere.ts", new Map())).toBeUndefined();
  });
});

describe("methodInMode", () => {
  const method = (internal?: boolean): MethodInfo => ({
    name: "foo",
    visibility: internal ? "private" : "public",
    params: [],
    ...(internal ? { internal: true } : {}),
  });

  it("public mode keeps only public methods (default)", () => {
    expect(methodInMode(method(false), "public")).toBe(true);
    expect(methodInMode(method(true), "public")).toBe(false);
  });

  it("private mode keeps only internal methods (--privates-only)", () => {
    expect(methodInMode(method(true), "private")).toBe(true);
    expect(methodInMode(method(false), "private")).toBe(false);
  });

  it("all mode keeps both public and internal methods (--privates)", () => {
    expect(methodInMode(method(true), "all")).toBe(true);
    expect(methodInMode(method(false), "all")).toBe(true);
  });

  it("treats missing internal flag as public", () => {
    // Legacy fixture manifests may not set `internal` at all; those
    // methods must count toward the public surface, not drop out.
    const bare: MethodInfo = { name: "x", visibility: "public", params: [] };
    expect(methodInMode(bare, "public")).toBe(true);
    expect(methodInMode(bare, "private")).toBe(false);
    expect(methodInMode(bare, "all")).toBe(true);
  });
});

describe("tsShouldIncludeInIndex", () => {
  // When --privates-only is active, a Ruby private method implemented as an
  // exported (public) TS function must still count as matched.
  // When default/public mode is active, internal TS methods must NOT satisfy
  // Ruby public method coverage (would inflate scores).
  // When --privates (all) is active, the full combined surface is shown, so
  // internal TS methods should also be included.

  const pub: MethodInfo = { name: "foo", visibility: "public", params: [] };
  const internal: MethodInfo = {
    name: "bar",
    visibility: "private",
    internal: true,
    params: [],
  };

  it("private mode includes both public and internal TS methods", () => {
    expect(tsShouldIncludeInIndex(pub, "private")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "private")).toBe(true);
  });

  it("public mode excludes internal TS methods", () => {
    expect(tsShouldIncludeInIndex(pub, "public")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "public")).toBe(false);
  });

  it("all mode includes both public and internal TS methods (full surface)", () => {
    expect(tsShouldIncludeInIndex(pub, "all")).toBe(true);
    expect(tsShouldIncludeInIndex(internal, "all")).toBe(true);
  });
});

describe("flattenIncludedMethodInfos", () => {
  function im(name: string): MethodInfo {
    return { name, visibility: "public", params: [] };
  }
  function mod(name: string, instance: string[], includes: string[] = []): ClassInfo {
    return {
      name,
      file: `${name.toLowerCase()}.rb`,
      includes,
      extends: [],
      instanceMethods: instance.map(im),
      classMethods: [],
    };
  }

  it("flattens included module instance methods onto the host", () => {
    // Mirrors arel #814: NodeExpression includes Predications + Math.
    // Without flattening, NodeExpression's expected surface is empty
    // and the wiring gap goes undetected.
    const predications = mod("Predications", ["eq", "gt", "lt"]);
    const math = mod("Math", ["add", "subtract"]);
    const host: ClassInfo = {
      name: "NodeExpression",
      file: "arel/nodes/node_expression.rb",
      includes: ["Predications", "Math"],
      extends: [],
      instanceMethods: [im("hash")],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: { "Arel::Nodes::NodeExpression": host },
      modules: { "Arel::Predications": predications, "Arel::Math": math },
    };
    const byShort = new Map([
      ["Predications", ["Arel::Predications"]],
      ["Math", ["Arel::Math"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Arel::Nodes::NodeExpression", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(
      ["add", "eq", "gt", "hash", "lt", "subtract"].sort(),
    );
    expect(f.klass).toEqual([]);
  });

  it("routes `extend` modules' instance methods as class methods on the host", () => {
    const enums = mod("Enum", ["values", "lookup"]);
    const host: ClassInfo = {
      name: "Base",
      file: "base.rb",
      includes: [],
      extends: ["Enum"],
      instanceMethods: [],
      classMethods: [im("inherited")],
    };
    const pkg: PackageInfo = {
      classes: { Base: host },
      modules: { Enum: enums },
    };
    const byShort = new Map([["Enum", ["Enum"]]]);
    const f = flattenIncludedMethodInfos(host, "Base", pkg, byShort);
    expect(f.instance.map((m) => m.name)).toEqual([]);
    expect(f.klass.map((m) => m.name).sort()).toEqual(["inherited", "lookup", "values"]);
  });

  it("recurses through nested module includes", () => {
    // Predications includes Constants → Constants's methods reach the host.
    const constants = mod("Constants", ["null", "true_value"]);
    const predications = mod("Predications", ["eq"], ["Constants"]);
    const host: ClassInfo = {
      name: "Attribute",
      file: "arel/attribute.rb",
      includes: ["Predications"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: { "Arel::Predications": predications, "Arel::Constants": constants },
    };
    const byShort = new Map([
      ["Predications", ["Arel::Predications"]],
      ["Constants", ["Arel::Constants"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Arel::Attribute", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["eq", "null", "true_value"]);
  });

  it("does not propagate a module's own `extend` through `include` chains", () => {
    // Ruby `extend X` affects only the receiver's singleton class. A
    // module that does `extend ActiveSupport::Concern` does NOT donate
    // Concern's methods to a class that does `include` the module.
    // (Rails' "class methods via include" pattern is ASC's nested
    // ClassMethods submodule, folded in by compare.ts upstream.)
    const concern = mod("Concern", ["append_features", "included"]);
    const myConcern = mod("MyConcern", ["instance_helper"]);
    myConcern.extends = ["Concern"];
    const host: ClassInfo = {
      name: "Host",
      file: "host.rb",
      includes: ["MyConcern"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: { Concern: concern, MyConcern: myConcern },
    };
    const byShort = new Map([
      ["Concern", ["Concern"]],
      ["MyConcern", ["MyConcern"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Host", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["instance_helper"]);
    expect(f.klass).toEqual([]);
  });

  it("skips modules outside the package without erroring", () => {
    // Comparable, Enumerable etc. live in stdlib — not in our manifest.
    const host: ClassInfo = {
      name: "Range",
      file: "range.rb",
      includes: ["Comparable", "Enumerable"],
      extends: [],
      instanceMethods: [im("first")],
      classMethods: [],
    };
    const pkg: PackageInfo = { classes: {}, modules: {} };
    const f = flattenIncludedMethodInfos(host, "Range", pkg, new Map());
    expect(f.instance.map((m) => m.name)).toEqual(["first"]);
  });

  it("guards against include cycles between modules", () => {
    const a = mod("A", ["a1"], ["B"]);
    const b = mod("B", ["b1"], ["A"]);
    const host: ClassInfo = {
      name: "Host",
      file: "host.rb",
      includes: ["A"],
      extends: [],
      instanceMethods: [im("h1")],
      classMethods: [],
    };
    const pkg: PackageInfo = { classes: {}, modules: { A: a, B: b } };
    const byShort = new Map([
      ["A", ["A"]],
      ["B", ["B"]],
    ]);
    const f = flattenIncludedMethodInfos(host, "Host", pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["a1", "b1", "h1"]);
  });

  it("scopes include resolution to host namespace — base Quoting, not adapter siblings", () => {
    // AbstractAdapter includes "Quoting". Ruby resolves to the base
    // ConnectionAdapters::Quoting, NOT to PostgreSQL::Quoting or MySQL::Quoting.
    const baseQuoting = mod("Quoting", ["quote", "quoteColumnName"]);
    const pgQuoting = mod("PostgreSQL::Quoting", ["escapeBytea", "quoteSchemaName"]);
    const mysqlQuoting = mod("MySQL::Quoting", ["unquotedBool"]);
    const host: ClassInfo = {
      name: "AbstractAdapter",
      file: "connection_adapters/abstract_adapter.rb",
      includes: ["Quoting"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: {
        "ActiveRecord::ConnectionAdapters::Quoting": baseQuoting,
        "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting": pgQuoting,
        "ActiveRecord::ConnectionAdapters::MySQL::Quoting": mysqlQuoting,
      },
    };
    const byShort = new Map([
      [
        "Quoting",
        [
          "ActiveRecord::ConnectionAdapters::Quoting",
          "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting",
          "ActiveRecord::ConnectionAdapters::MySQL::Quoting",
        ],
      ],
    ]);
    const f = flattenIncludedMethodInfos(
      host,
      "ActiveRecord::ConnectionAdapters::AbstractAdapter",
      pkg,
      byShort,
    );
    // Should only get base Quoting methods, NOT PG or MySQL specifics
    expect(f.instance.map((m) => m.name).sort()).toEqual(["quote", "quoteColumnName"]);
  });

  it("scopes include resolution to adapter namespace — adapter-specific Quoting", () => {
    // PostgreSQLAdapter includes "Quoting". Ruby resolves to PostgreSQL::Quoting.
    const baseQuoting = mod("Quoting", ["quote", "quoteColumnName"]);
    const pgQuoting = mod("PostgreSQL::Quoting", ["escapeBytea", "quoteSchemaName"]);
    const host: ClassInfo = {
      name: "PostgreSQLAdapter",
      file: "connection_adapters/postgresql_adapter.rb",
      includes: ["Quoting"],
      extends: [],
      instanceMethods: [],
      classMethods: [],
    };
    const pkg: PackageInfo = {
      classes: {},
      modules: {
        "ActiveRecord::ConnectionAdapters::Quoting": baseQuoting,
        "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting": pgQuoting,
      },
    };
    const byShort = new Map([
      [
        "Quoting",
        [
          "ActiveRecord::ConnectionAdapters::Quoting",
          "ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting",
        ],
      ],
    ]);
    const f = flattenIncludedMethodInfos(
      host,
      "ActiveRecord::ConnectionAdapters::PostgreSQL::PostgreSQLAdapter",
      pkg,
      byShort,
    );
    // Should resolve to PostgreSQL::Quoting, not the base abstract Quoting
    expect(f.instance.map((m) => m.name).sort()).toEqual(["escapeBytea", "quoteSchemaName"]);
  });
});

describe("resolveModuleName", () => {
  it("returns the single candidate unchanged", () => {
    const byShort = new Map([["Quoting", ["AR::ConnectionAdapters::Quoting"]]]);
    expect(
      resolveModuleName("Quoting", "AR::ConnectionAdapters::AbstractAdapter", byShort),
    ).toEqual(["AR::ConnectionAdapters::Quoting"]);
  });

  it("passes through already-qualified names without consulting the map", () => {
    // Early return fires on "::" — byShort is irrelevant for pre-qualified names.
    expect(resolveModuleName("Foo::Bar", "Baz::Qux", new Map())).toEqual(["Foo::Bar"]);
  });

  it("returns all candidates when context has no prefix match", () => {
    const byShort = new Map([["Foo", ["X::Foo", "Y::Foo"]]]);
    expect(resolveModuleName("Foo", "Z::Bar", byShort)).toEqual(["X::Foo", "Y::Foo"]);
  });

  it("prefers nearest namespace prefix — abstract base wins over sibling adapter", () => {
    const candidates = [
      "AR::ConnectionAdapters::Quoting",
      "AR::ConnectionAdapters::PostgreSQL::Quoting",
      "AR::ConnectionAdapters::MySQL::Quoting",
    ];
    const byShort = new Map([["Quoting", candidates]]);
    const result = resolveModuleName("Quoting", "AR::ConnectionAdapters::AbstractAdapter", byShort);
    expect(result).toEqual(["AR::ConnectionAdapters::Quoting"]);
  });

  it("prefers adapter-specific namespace when including class is in that namespace", () => {
    const candidates = [
      "AR::ConnectionAdapters::Quoting",
      "AR::ConnectionAdapters::PostgreSQL::Quoting",
    ];
    const byShort = new Map([["Quoting", candidates]]);
    const result = resolveModuleName(
      "Quoting",
      "AR::ConnectionAdapters::PostgreSQL::PostgreSQLAdapter",
      byShort,
    );
    expect(result).toEqual(["AR::ConnectionAdapters::PostgreSQL::Quoting"]);
  });
});

describe("dedupeRubyMethodInto", () => {
  function rm(name: string): MethodInfo {
    return {
      name,
      visibility: "public",
      params: [],
      isStatic: false,
      file: "x.rb",
      line: 1,
    };
  }

  it("retains distinct Ruby methods even when their first TS candidates collide", () => {
    // Regression: previous dedup keyed on the first TS candidate, so
    // `is_number?` and `number?` (both → "isNumber") collapsed silently.
    // Keying by Ruby name keeps them as two distinct expected entries.
    const seen = new Map<string, { rubyName: string; rubyModule: string }>();
    dedupeRubyMethodInto(seen, rm("is_number?"), "ActiveModel::Validations::Numericality");
    dedupeRubyMethodInto(seen, rm("number?"), "ActiveModel::Validations::Numericality");
    expect([...seen.values()].map((v) => v.rubyName).sort()).toEqual(["is_number?", "number?"]);
  });

  it("still dedups true repeats of the same Ruby method (e.g. subclass overrides)", () => {
    // Multiple subclasses in one file overriding `invert` should count
    // once — the original behavior the dedup was designed for.
    const seen = new Map<string, { rubyName: string; rubyModule: string }>();
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::A");
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::B");
    dedupeRubyMethodInto(seen, rm("invert"), "Foo::C");
    expect(seen.size).toBe(1);
    // First insertion wins, so the FQN points at the first observer.
    expect([...seen.values()][0]).toEqual({ rubyName: "invert", rubyModule: "Foo::A" });
  });
});

describe("selectMisplacedFile", () => {
  function hits(...entries: [string, number][]): Map<string, number> {
    return new Map(entries);
  }

  it("returns null when no file has any hits", () => {
    expect(selectMisplacedFile(hits(), 10)).toBeNull();
  });

  it("returns null below the absolute hit floor", () => {
    // 2 hits, 2 expected methods → 100% coverage and 2× over zero
    // runner-up, but absolute floor is MISPLACED_MIN_HITS=3.
    expect(selectMisplacedFile(hits(["a.ts", 2]), 2)).toBeNull();
    expect(MISPLACED_MIN_HITS).toBe(3);
  });

  it("returns null when coverage is below 50%", () => {
    // 3 hits but ruby file has 7 methods → 43% coverage. This is the
    // exact `deprecator.rb ↦ migration.ts` false-positive shape.
    expect(selectMisplacedFile(hits(["migration.ts", 3]), 7)).toBeNull();
  });

  it("returns null when leader is not 2× the runner-up", () => {
    // 3 hits leader, 2 hits runner-up → leader < 2×, ambiguous.
    const result = selectMisplacedFile(hits(["a.ts", 3], ["b.ts", 2]), 6);
    expect(result).toBeNull();
  });

  it("returns the cluster file when all three thresholds pass", () => {
    // 5 hits in app-generator.ts out of 8 expected methods → 62%
    // coverage, ≥3 absolute, runner-up only 1.
    const result = selectMisplacedFile(hits(["app-generator.ts", 5], ["other.ts", 1]), 8);
    expect(result).toBe("app-generator.ts");
  });

  it("picks the file with the highest count when several are tied at low values", () => {
    // Pure tie at the noise floor → still null because no separation.
    const result = selectMisplacedFile(hits(["a.ts", 3], ["b.ts", 3], ["c.ts", 3]), 6);
    expect(result).toBeNull();
  });

  it("accepts a clear leader even with multiple low-hit competitors", () => {
    // 6/10 hits in winner, scattered noise elsewhere.
    const result = selectMisplacedFile(
      hits(["winner.ts", 6], ["a.ts", 1], ["b.ts", 1], ["c.ts", 1]),
      10,
    );
    expect(result).toBe("winner.ts");
  });
});

describe("buildEntitiesByName", () => {
  it("includes entities from the current package", () => {
    const base = cls("packages/activerecord/src/base.ts", "Base");
    const ts = makeManifest({ activerecord: { classes: { Base: base } } });
    const map = buildEntitiesByName("activerecord", ts);
    expect(map.get("Base")).toContain(base);
  });

  it("includes entities from @blazetrails/* dep packages when package.json lists them", () => {
    // activerecord depends on activemodel; Model lives in activemodel.
    const model = cls("packages/activemodel/src/model.ts", "Model");
    model.instanceMethods = [method("attributes")];

    const base = cls("packages/activerecord/src/base.ts", "Base");
    base.superclass = "Model";

    const ts = makeManifest({
      activerecord: { classes: { Base: base } },
      activemodel: { classes: { Model: model } },
    });

    // activerecord's real package.json includes @blazetrails/activemodel,
    // so buildEntitiesByName should pull in Model from activemodel.
    const map = buildEntitiesByName("activerecord", ts);
    const modelCandidates = map.get("Model") ?? [];
    expect(modelCandidates).toContain(model);
  });

  it("does not add dep-package entities for a package with no blazetrails deps (e.g. activesupport)", () => {
    const concern = cls("packages/activesupport/src/concern.ts", "Concern");
    const ts = makeManifest({
      activesupport: { classes: { Concern: concern } },
      activemodel: { classes: { Model: cls("packages/activemodel/src/model.ts", "Model") } },
    });

    const map = buildEntitiesByName("activesupport", ts);
    // activesupport's package.json has no @blazetrails/* deps, so Model must not appear.
    expect(map.has("Model")).toBe(false);
  });

  it("excludes __fixtures__ and tsc-wrapper stubs so they don't shadow real dep-package entities", () => {
    // activerecord tsc-wrapper fixtures contain a stub Model with 1 method;
    // the real Model in activemodel has many methods. Fixtures must be skipped.
    const stubModel = cls("tsc-wrapper/__fixtures__/base.ts", "Model");
    stubModel.instanceMethods = [method("stub")];
    const realModel = cls("model.ts", "Model");
    realModel.instanceMethods = [method("attributes"), method("readAttribute")];

    const ts = makeManifest({
      activerecord: { classes: { StubModel: stubModel } },
      activemodel: { classes: { Model: realModel } },
    });

    const map = buildEntitiesByName("activerecord", ts);
    const candidates = map.get("Model") ?? [];
    expect(candidates).toContain(realModel);
    expect(candidates).not.toContain(stubModel);
  });

  it("current-package entities appear before dep-package entities (same name)", () => {
    const localModel = cls("packages/activerecord/src/model.ts", "Model");
    const depModel = cls("packages/activemodel/src/model.ts", "Model");
    const ts = makeManifest({
      activerecord: { classes: { LocalModel: localModel } },
      activemodel: { classes: { Model: depModel } },
    });
    // Override localModel name so both share the key "Model"
    localModel.name = "Model";

    const map = buildEntitiesByName("activerecord", ts);
    const candidates = map.get("Model") ?? [];
    // Local should be first (added first due to current-package priority)
    expect(candidates[0]).toBe(localModel);
  });
});
