import { describe, it, expect } from "vitest";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { Table, Nodes, Visitors } from "../index.js";
import { buildQuoted } from "../nodes/casted.js";

describe("TestDot", () => {
  const dot = new Visitors.Dot();

  it("named function", () => {
    const func = new Nodes.NamedFunction("omg", "omg" as never);
    dot.compile(func);
  });

  it("Arel Nodes BindParam", () => {
    const node = new Nodes.BindParam(1);
    expect(dot.compile(node)).toMatch('[label="<f0>BindParam"]');
  });

  it("ActiveModel Attribute", () => {
    const node = ModelAttribute.withCastValue("LIMIT", 1, null as never);
    expect(dot.compile(node as never)).toMatch('[label="<f0>WithCastValue"]');
  });

  it("Arel Nodes CurrentRow", () => {
    const node = new Nodes.CurrentRow();
    expect(dot.compile(node)).toMatch('[label="<f0>CurrentRow"]');
  });

  it("Arel Nodes Distinct", () => {
    const node = new Nodes.Distinct();
    expect(dot.compile(node)).toMatch('[label="<f0>Distinct"]');
  });

  it("Arel Nodes Case and friends", () => {
    const foo = buildQuoted("foo");
    const node = new Nodes.Case(foo);
    node.conditions = [new Nodes.When(foo, buildQuoted(1))];
    node.default = new Nodes.Else(buildQuoted(0));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Case"]');
    expect(out).toMatch(/->.*label="case"/);
    expect(out).toMatch(/->.*label="conditions"/);
    expect(out).toMatch(/->.*label="default"/);
    expect(out).toMatch('[label="<f0>When"]');
    expect(out).toMatch('[label="<f0>Else"]');
    expect(out).toMatch('[label="<f0>Else"]');
  });

  it("Arel Nodes InfixOperation", () => {
    const node = new Nodes.InfixOperation("&&", buildQuoted(1), buildQuoted(2));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>InfixOperation"]');
    expect(out).toMatch(/->.*label="operator"/);
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
  });

  it("Arel Nodes RegExp", () => {
    const table = new Table("users");
    const node = new Nodes.Regexp(table.get("name"), buildQuoted("foo%"));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Regexp"]');
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
    expect(out).toMatch(/->.*label="caseSensitive"/);
  });

  it("Arel Nodes NotRegExp", () => {
    const table = new Table("users");
    const node = new Nodes.NotRegexp(table.get("name"), buildQuoted("foo%"));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>NotRegexp"]');
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
    expect(out).toMatch(/->.*label="caseSensitive"/);
  });

  it("Arel Nodes UnaryOperation", () => {
    const node = new Nodes.UnaryOperation("-", 1 as never);

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>UnaryOperation"]');
    expect(out).toMatch(/->.*label="operator"/);
    expect(out).toMatch(/->.*label="expr"/);
  });

  it("Arel Nodes With", () => {
    const node = new Nodes.With(["query1", "query2", "query3"] as never);

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>With"]');
    expect(out).toMatch(/->.*label="0"/);
    expect(out).toMatch(/->.*label="1"/);
    expect(out).toMatch(/->.*label="2"/);
  });

  it("Arel Nodes SelectCore", () => {
    const node = new Nodes.SelectCore();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>SelectCore"]');
    expect(out).toMatch(/->.*label="source"/);
    expect(out).toMatch(/->.*label="projections"/);
    expect(out).toMatch(/->.*label="wheres"/);
    expect(out).toMatch(/->.*label="windows"/);
    expect(out).toMatch(/->.*label="groups"/);
    expect(out).toMatch(/->.*label="comment"/);
    expect(out).toMatch(/->.*label="havings"/);
    expect(out).toMatch(/->.*label="setQuantifier"/);
    expect(out).toMatch(/->.*label="optimizerHints"/);
  });

  it("Arel Nodes SelectStatement", () => {
    const node = new Nodes.SelectStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>SelectStatement"]');
    expect(out).toMatch(/->.*label="cores"/);
    expect(out).toMatch(/->.*label="limit"/);
    expect(out).toMatch(/->.*label="orders"/);
    expect(out).toMatch(/->.*label="offset"/);
    expect(out).toMatch(/->.*label="lock"/);
    expect(out).toMatch(/->.*label="with"/);
  });

  it("Arel Nodes InsertStatement", () => {
    const node = new Nodes.InsertStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>InsertStatement"]');
    expect(out).toMatch(/->.*label="relation"/);
    expect(out).toMatch(/->.*label="columns"/);
    expect(out).toMatch(/->.*label="values"/);
    expect(out).toMatch(/->.*label="select"/);
  });

  it("Arel Nodes UpdateStatement", () => {
    const node = new Nodes.UpdateStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>UpdateStatement"]');
    expect(out).toMatch(/->.*label="relation"/);
    expect(out).toMatch(/->.*label="wheres"/);
    expect(out).toMatch(/->.*label="values"/);
    expect(out).toMatch(/->.*label="orders"/);
    expect(out).toMatch(/->.*label="limit"/);
    expect(out).toMatch(/->.*label="offset"/);
    expect(out).toMatch(/->.*label="key"/);
  });

  it("Arel Nodes DeleteStatement", () => {
    const node = new Nodes.DeleteStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>DeleteStatement"]');
    expect(out).toMatch(/->.*label="relation"/);
    expect(out).toMatch(/->.*label="wheres"/);
    expect(out).toMatch(/->.*label="orders"/);
    expect(out).toMatch(/->.*label="limit"/);
    expect(out).toMatch(/->.*label="offset"/);
    expect(out).toMatch(/->.*label="key"/);
  });
});
