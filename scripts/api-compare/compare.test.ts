import { describe, it, expect } from "vitest";
import { nameMatches, superclassesMatch, resolveTsClassForRuby, methodInMode } from "./compare.js";
import type { ClassInfo, MethodInfo } from "./types.js";

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

  it("keeps public methods when --privates is off", () => {
    expect(methodInMode(method(false), false)).toBe(true);
    expect(methodInMode(method(true), false)).toBe(false);
  });

  it("keeps only internal methods when --privates is on", () => {
    expect(methodInMode(method(true), true)).toBe(true);
    expect(methodInMode(method(false), true)).toBe(false);
  });

  it("treats missing internal flag as public", () => {
    // Legacy fixture manifests may not set `internal` at all; those
    // methods must count toward the public surface, not drop out.
    const bare: MethodInfo = { name: "x", visibility: "public", params: [] };
    expect(methodInMode(bare, false)).toBe(true);
    expect(methodInMode(bare, true)).toBe(false);
  });
});
