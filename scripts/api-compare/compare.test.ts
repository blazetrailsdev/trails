import { describe, it, expect } from "vitest";
import {
  nameMatches,
  superclassesMatch,
  resolveTsClassForRuby,
  methodInMode,
  tsShouldIncludeInIndex,
  flattenIncludedMethodInfos,
} from "./compare.js";
import type { ClassInfo, MethodInfo, PackageInfo } from "./types.js";

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
    const f = flattenIncludedMethodInfos(host, pkg, byShort);
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
    const f = flattenIncludedMethodInfos(host, pkg, byShort);
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
    const f = flattenIncludedMethodInfos(host, pkg, byShort);
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
    const f = flattenIncludedMethodInfos(host, pkg, byShort);
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
    const f = flattenIncludedMethodInfos(host, pkg, new Map());
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
    const f = flattenIncludedMethodInfos(host, pkg, byShort);
    expect(f.instance.map((m) => m.name).sort()).toEqual(["a1", "b1", "h1"]);
  });
});
