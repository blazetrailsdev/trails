import { describe, it, expect } from "vitest";
import { Attribute as ModelAttribute } from "@blazetrails/activemodel";
import { Collectors, Table, Nodes, Visitors } from "../index.js";
import { buildQuoted } from "../nodes/casted.js";

describe("TestDot", () => {
  const dot = new Visitors.Dot();

  type Ctor = new (...args: never[]) => Nodes.Node;
  const acceptFunction = (klass: Ctor) => {
    const op = new klass(":a" as never, "z" as never);
    dot.accept(op, new Collectors.PlainString());
  };
  const acceptUnary = (klass: Ctor) => {
    const op = new klass(":a" as never);
    dot.accept(op, new Collectors.PlainString());
  };
  const acceptBinary = (klass: Ctor) => {
    const binary = new klass(":a" as never, ":b" as never);
    dot.accept(binary, new Collectors.PlainString());
  };
  const acceptNary = (klass: Ctor) => {
    const binary = new klass([":a", ":b"] as never);
    dot.accept(binary, new Collectors.PlainString());
  };

  it("Arel Nodes Sum", () => acceptFunction(Nodes.Sum));
  it("Arel Nodes Exists", () => acceptFunction(Nodes.Exists));
  it("Arel Nodes Max", () => acceptFunction(Nodes.Max));
  it("Arel Nodes Min", () => acceptFunction(Nodes.Min));
  it("Arel Nodes Avg", () => acceptFunction(Nodes.Avg));

  it("named function", () => {
    const func = new Nodes.NamedFunction("omg", "omg" as never);
    dot.compile(func);
  });

  it("Arel Nodes Not", () => acceptUnary(Nodes.Not));
  it("Arel Nodes Group", () => acceptUnary(Nodes.Group));
  it("Arel Nodes On", () => acceptUnary(Nodes.On));
  it("Arel Nodes Grouping", () => acceptUnary(Nodes.Grouping));
  it("Arel Nodes Offset", () => acceptUnary(Nodes.Offset));
  it("Arel Nodes Ordering", () => acceptUnary(Nodes.Ordering));
  it("Arel Nodes UnqualifiedColumn", () => acceptUnary(Nodes.UnqualifiedColumn));
  it("Arel Nodes ValuesList", () => acceptUnary(Nodes.ValuesList));
  it("Arel Nodes Limit", () => acceptUnary(Nodes.Limit));

  it("Arel Nodes Assignment", () => acceptBinary(Nodes.Assignment));
  it("Arel Nodes Between", () => acceptBinary(Nodes.Between));
  it("Arel Nodes DoesNotMatch", () => acceptBinary(Nodes.DoesNotMatch));
  it("Arel Nodes Equality", () => acceptBinary(Nodes.Equality));
  it("Arel Nodes GreaterThan", () => acceptBinary(Nodes.GreaterThan));
  it("Arel Nodes GreaterThanOrEqual", () => acceptBinary(Nodes.GreaterThanOrEqual));
  it("Arel Nodes In", () => acceptBinary(Nodes.In));
  it("Arel Nodes LessThan", () => acceptBinary(Nodes.LessThan));
  it("Arel Nodes LessThanOrEqual", () => acceptBinary(Nodes.LessThanOrEqual));
  it("Arel Nodes Matches", () => acceptBinary(Nodes.Matches));
  it("Arel Nodes NotEqual", () => acceptBinary(Nodes.NotEqual));
  it("Arel Nodes NotIn", () => acceptBinary(Nodes.NotIn));
  it("Arel Nodes TableAlias", () => acceptBinary(Nodes.TableAlias));
  it("Arel Nodes As", () => acceptBinary(Nodes.As));
  it("Arel Nodes JoinSource", () => acceptBinary(Nodes.JoinSource));
  it("Arel Nodes Casted", () => acceptBinary(Nodes.Casted));

  it("Arel Nodes And", () => acceptNary(Nodes.And));
  it("Arel Nodes Or", () => acceptNary(Nodes.Or));

  it("Arel Nodes BindParam", () => {
    const node = new Nodes.BindParam(1);
    expect(dot.compile(node)).toMatch('[label="<f0>Arel::Nodes::BindParam"]');
  });

  it("ActiveModel Attribute", () => {
    const node = ModelAttribute.withCastValue("LIMIT", 1, null as never);
    expect(dot.compile(node as never)).toMatch(
      '[label="<f0>ActiveModel::Attribute::WithCastValue"]',
    );
  });

  it("Arel Nodes CurrentRow", () => {
    const node = new Nodes.CurrentRow();
    expect(dot.compile(node)).toMatch('[label="<f0>Arel::Nodes::CurrentRow"]');
  });

  it("Arel Nodes Distinct", () => {
    const node = new Nodes.Distinct();
    expect(dot.compile(node)).toMatch('[label="<f0>Arel::Nodes::Distinct"]');
  });

  it("Arel Nodes Case and friends", () => {
    const foo = buildQuoted("foo");
    const node = new Nodes.Case(foo);
    node.conditions = [new Nodes.When(foo, buildQuoted(1))];
    node.default = new Nodes.Else(buildQuoted(0));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::Case"]');
    expect(out).toMatch(/->.*label="case"/);
    expect(out).toMatch(/->.*label="conditions"/);
    expect(out).toMatch(/->.*label="default"/);
    expect(out).toMatch('[label="<f0>Arel::Nodes::When"]');
    expect(out).toMatch('[label="<f0>Arel::Nodes::Else"]');
    expect(out).toMatch('[label="<f0>Arel::Nodes::Else"]');
  });

  it("Arel Nodes InfixOperation", () => {
    const node = new Nodes.InfixOperation("&&", buildQuoted(1), buildQuoted(2));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::InfixOperation"]');
    expect(out).toMatch(/->.*label="operator"/);
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
  });

  it("Arel Nodes RegExp", () => {
    const table = new Table("users");
    const node = new Nodes.Regexp(table.get("name"), buildQuoted("foo%"));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::Regexp"]');
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
    expect(out).toMatch(/->.*label="case_sensitive"/);
  });

  it("Arel Nodes NotRegExp", () => {
    const table = new Table("users");
    const node = new Nodes.NotRegexp(table.get("name"), buildQuoted("foo%"));

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::NotRegexp"]');
    expect(out).toMatch(/->.*label="left"/);
    expect(out).toMatch(/->.*label="right"/);
    expect(out).toMatch(/->.*label="case_sensitive"/);
  });

  it("Arel Nodes UnaryOperation", () => {
    const node = new Nodes.UnaryOperation("-", 1 as never);

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::UnaryOperation"]');
    expect(out).toMatch(/->.*label="operator"/);
    expect(out).toMatch(/->.*label="expr"/);
  });

  it("Arel Nodes With", () => {
    const node = new Nodes.With(["query1", "query2", "query3"] as never);

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::With"]');
    expect(out).toMatch(/->.*label="0"/);
    expect(out).toMatch(/->.*label="1"/);
    expect(out).toMatch(/->.*label="2"/);
  });

  it("Arel Nodes SelectCore", () => {
    const node = new Nodes.SelectCore();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::SelectCore"]');
    expect(out).toMatch(/->.*label="source"/);
    expect(out).toMatch(/->.*label="projections"/);
    expect(out).toMatch(/->.*label="wheres"/);
    expect(out).toMatch(/->.*label="windows"/);
    expect(out).toMatch(/->.*label="groups"/);
    expect(out).toMatch(/->.*label="comment"/);
    expect(out).toMatch(/->.*label="havings"/);
    expect(out).toMatch(/->.*label="set_quantifier"/);
    expect(out).toMatch(/->.*label="optimizer_hints"/);
  });

  it("Arel Nodes SelectStatement", () => {
    const node = new Nodes.SelectStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::SelectStatement"]');
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

    expect(out).toMatch('[label="<f0>Arel::Nodes::InsertStatement"]');
    expect(out).toMatch(/->.*label="relation"/);
    expect(out).toMatch(/->.*label="columns"/);
    expect(out).toMatch(/->.*label="values"/);
    expect(out).toMatch(/->.*label="select"/);
  });

  it("Arel Nodes UpdateStatement", () => {
    const node = new Nodes.UpdateStatement();

    const out = dot.compile(node);

    expect(out).toMatch('[label="<f0>Arel::Nodes::UpdateStatement"]');
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

    expect(out).toMatch('[label="<f0>Arel::Nodes::DeleteStatement"]');
    expect(out).toMatch(/->.*label="relation"/);
    expect(out).toMatch(/->.*label="wheres"/);
    expect(out).toMatch(/->.*label="orders"/);
    expect(out).toMatch(/->.*label="limit"/);
    expect(out).toMatch(/->.*label="offset"/);
    expect(out).toMatch(/->.*label="key"/);
  });
});
