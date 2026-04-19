import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "../index.js";
import { buildQuoted } from "./casted.js";
import { Attribute as AMAttribute, ValueType } from "@blazetrails/activemodel";
import { SelectManager } from "../select-manager.js";

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
});
