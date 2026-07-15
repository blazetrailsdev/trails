import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";
import { buildQuoted } from "./casted.js";
import { Attribute as AMAttribute, ValueType } from "@blazetrails/activemodel";
import { SelectManager } from "../select-manager.js";

describe("Arel::Nodes::Quoted", () => {
  it("is a Unary subclass (value stored in expr slot)", () => {
    const q = new Nodes.Quoted(42);
    expect(q).toBeInstanceOf(Nodes.Unary);
  });

  it("value getter returns expr", () => {
    const q = new Nodes.Quoted("hello");
    expect(q.value).toBe("hello");
    expect((q as { expr: unknown }).expr).toBe("hello");
  });

  it("eql compares by value", () => {
    expect(new Nodes.Quoted(1).eql(new Nodes.Quoted(1))).toBe(true);
    expect(new Nodes.Quoted(1).eql(new Nodes.Quoted(2))).toBe(false);
  });
});

describe("#hash", () => {
  const users = new Table("users");
  it("is equal when eql? returns true", () => {
    const attr = users.get("age");
    const a = new Nodes.Casted(1, attr);
    const b = new Nodes.Casted(1, attr);
    expect(a.eql(b)).toBe(true);
    expect(a.hash()).toBe(b.hash());
  });
});

describe("Arel::Nodes.build_quoted", () => {
  const users = new Table("users");

  it("passes Arel Nodes through unchanged", () => {
    const node = new Nodes.SqlLiteral("RAW");
    expect(buildQuoted(node)).toBe(node);
  });

  it("passes Arel::Attribute through unchanged (duck-typed)", () => {
    const attr = users.get("id");
    expect(buildQuoted(attr)).toBe(attr);
  });

  it("wraps ActiveModel::Attribute in BindParam so it participates in bind extraction", () => {
    const amAttr = AMAttribute.withCastValue("id", 7, new ValueType());
    const node = buildQuoted(amAttr);
    expect(node).toBeInstanceOf(Nodes.BindParam);
    expect((node as Nodes.BindParam).value).toBe(amAttr);

    // compileWithBinds should collect it (not inline it) — matches Rails'
    // visit_ActiveModel_Attribute routing through add_bind.
    const [sql, binds] = new Visitors.ToSql().compileWithBinds(node);
    expect(sql).toBe("?");
    expect(binds).toEqual([amAttr]);
  });

  it("unwraps a TreeManager-shaped .ast so the visitor receives a real Node", () => {
    const sub = new SelectManager(users).project(users.get("id"));
    const node = buildQuoted(sub);
    // SelectStatement (or a Node) — NOT the manager itself.
    expect(node).toBeInstanceOf(Nodes.SelectStatement);
  });

  it("wraps in Casted when the second arg is an Arel::Attribute", () => {
    const attr = users.get("age");
    const node = buildQuoted(42, attr);
    expect(node).toBeInstanceOf(Nodes.Casted);
    expect((node as Nodes.Casted).value).toBe(42);
    expect((node as Nodes.Casted).attribute).toBe(attr);
  });

  it("wraps in Quoted when no attribute is given", () => {
    const node = buildQuoted(42);
    expect(node).toBeInstanceOf(Nodes.Quoted);
    expect((node as Nodes.Quoted).value).toBe(42);
  });

  it("wraps nil in Casted when the second arg is an Arel::Attribute", () => {
    const attr = users.get("age");
    const node = buildQuoted(null, attr);
    expect(node).toBeInstanceOf(Nodes.Casted);
    expect((node as Nodes.Casted).value).toBeNull();
    expect((node as Nodes.Casted).attribute).toBe(attr);
  });

  it("wraps nil in Quoted when no attribute is given", () => {
    const node = buildQuoted(null);
    expect(node).toBeInstanceOf(Nodes.Quoted);
    expect((node as Nodes.Quoted).value).toBeNull();
  });

  it("wraps an ActiveModel::Attribute in BindParam", () => {
    const attr = AMAttribute.fromUser("age", 42, new ValueType());
    const node = buildQuoted(attr);
    expect(node).toBeInstanceOf(Nodes.BindParam);
    expect((node as Nodes.BindParam).value).toBe(attr);
  });

  // Rails dispatches casted.rb:50's `when` arm on the class, so an object that
  // merely looks like an ActiveModel::Attribute falls through to the `else`.
  it("does not treat an ActiveModel::Attribute duck-type as one", () => {
    expect(buildQuoted({ name: "age", valueForDatabase: 42 })).toBeInstanceOf(Nodes.Quoted);
    expect(buildQuoted({ name: "x" })).toBeInstanceOf(Nodes.Quoted);
  });
});

describe("Arel::Nodes::Casted#nil?", () => {
  const users = new Table("users");

  it("is true for a nil value and false otherwise", () => {
    const attr = users.get("age");
    expect(new Nodes.Casted(null, attr).isNil()).toBe(true);
    expect(new Nodes.Casted(0, attr).isNil()).toBe(false);
  });

  // Ruby has one nil, so undefined is a nil? here too. This keeps
  // attr.eq(undefined) spelling IS NULL: before this change quotedNode
  // normalized undefined to Quoted(null), so a null-only isNil() would
  // regress it to `= NULL`.
  it("treats undefined as nil, so eq(undefined) still renders IS NULL", () => {
    const attr = users.get("age");
    expect(new Nodes.Casted(undefined, attr).isNil()).toBe(true);
    expect(new Nodes.Quoted(undefined).isNil()).toBe(true);

    const [sql] = new Visitors.ToSql().compileWithBinds(users.get("id").eq(undefined));
    expect(sql).toBe('"users"."id" IS NULL');
  });

  // `= NULL` is never true in SQL; Quoted#nil? (casted.rb:41) is defined
  // identically to Casted's, so an undefined-valued Quoted spells IS NULL too.
  it("renders IS NULL for a Quoted(undefined) right-hand side", () => {
    const eq = new Nodes.Equality(users.get("id"), new Nodes.Quoted(undefined));
    const [sql] = new Visitors.ToSql().compileWithBinds(eq);
    expect(sql).toBe('"users"."id" IS NULL');
  });

  // casted.rb:15 reads the raw `value`, NOT `value_for_database` — a type whose
  // serialize(nil) is non-nil must still spell IS NULL.
  it("reads the raw value, not value_for_database", () => {
    const table = new Table("users");
    (table as unknown as { isAbleToTypeCast?: () => boolean }).isAbleToTypeCast = () => true;
    (
      table as unknown as { typeCastForDatabase?: (n: string, v: unknown) => unknown }
    ).typeCastForDatabase = (_name, value) => (value === null ? "NIL" : value);

    const node = new Nodes.Casted(null, table.get("age"));
    expect(node.valueForDatabase()).toBe("NIL");
    expect(node.isNil()).toBe(true);
  });

  // quoted_node is build_quoted(other, self), so a nil from an Attribute is
  // Casted — carrying the column's type-cast context — not a bare Quoted.
  it("is what an Attribute's quoted_node builds for nil, and still renders IS NULL", () => {
    const attr = users.get("id");
    const eq = attr.eq(null);
    expect(eq.right).toBeInstanceOf(Nodes.Casted);
    expect((eq.right as Nodes.Casted).attribute).toBe(attr);
    const [sql] = new Visitors.ToSql().compileWithBinds(eq);
    expect(sql).toBe('"users"."id" IS NULL');
  });
});
