import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors, Collectors } from "../index.js";
import { buildQuoted } from "./casted.js";
import { Attribute as AMAttribute, ValueType } from "@blazetrails/activemodel";
import { SelectManager } from "../select-manager.js";

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

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
    expect(node).toBe(amAttr as unknown as Nodes.Node);

    const [sql, binds] = compileWithBinds(new Visitors.ToSql(fakeRecordConnection), node);
    expect(sql).toBe("?");
    expect(binds).toEqual([amAttr]);
  });

  it("passes a TreeManager-shaped .ast holder through unchanged", () => {
    const sub = new SelectManager(users).project(users.get("id"));
    const node = buildQuoted(sub);
    expect(node).toBe(sub);
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
    expect(node).toBe(attr as unknown as Nodes.Node);
  });

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

  it("treats undefined as nil, so eq(undefined) still renders IS NULL", () => {
    const attr = users.get("age");
    expect(new Nodes.Casted(undefined, attr).isNil()).toBe(true);
    expect(new Nodes.Quoted(undefined).isNil()).toBe(true);

    const [sql] = compileWithBinds(
      new Visitors.ToSql(fakeRecordConnection),
      users.get("id").eq(undefined),
    );
    expect(sql).toBe('"users"."id" IS NULL');
  });

  it("renders IS NULL for a Quoted(undefined) right-hand side", () => {
    const eq = new Nodes.Equality(users.get("id"), new Nodes.Quoted(undefined));
    const [sql] = compileWithBinds(new Visitors.ToSql(fakeRecordConnection), eq);
    expect(sql).toBe('"users"."id" IS NULL');
  });

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

  it("is what an Attribute's quoted_node builds for nil, and still renders IS NULL", () => {
    const attr = users.get("id");
    const eq = attr.eq(null);
    expect(eq.right).toBeInstanceOf(Nodes.Casted);
    expect((eq.right as Nodes.Casted).attribute).toBe(attr);
    const [sql] = compileWithBinds(new Visitors.ToSql(fakeRecordConnection), eq);
    expect(sql).toBe('"users"."id" IS NULL');
  });
});
