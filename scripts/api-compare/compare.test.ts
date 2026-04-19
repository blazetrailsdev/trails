import { describe, it, expect } from "vitest";
import { nameMatches, superclassesMatch } from "./compare.js";

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
  });

  it("accepts arel Table/Attribute extending Node when Ruby has no super", () => {
    expect(superclassesMatch(null, ["Node"], "Table")).toBe(true);
    expect(superclassesMatch(null, ["Node"], "Attribute")).toBe(true);
  });

  it("does not auto-accept other classes extending Node with null Ruby super", () => {
    // Only Table/Attribute are on the arel-root whitelist.
    expect(superclassesMatch(null, ["Node"], "Something")).toBe(false);
  });
});
