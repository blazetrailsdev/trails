import { describe, it, expect } from "vitest";
import { Table, Nodes } from "./index.js";
import { FactoryMethods } from "./factory-methods.js";

describe("TestFactoryMethods", () => {
  const factory = FactoryMethods;

  it("create join", () => {
    const join = factory.createJoin("one", "two");
    expect(join).toBeInstanceOf(Nodes.Join);
    expect(join.right).toBe("two");
  });

  it("create table alias", () => {
    const tableAlias = factory.createTableAlias("one" as unknown as Nodes.Node, "two");
    expect(tableAlias).toBeInstanceOf(Nodes.TableAlias);
    expect(tableAlias.right).toBe("two");
  });

  it("create and", () => {
    const andNode = factory.createAnd(["foo", "bar"]);
    expect(andNode).toBeInstanceOf(Nodes.And);
    expect(andNode.children).toEqual(["foo", "bar"]);
  });

  it("create string join", () => {
    const join = factory.createStringJoin("foo");
    expect(join).toBeInstanceOf(Nodes.StringJoin);
    expect(join.left).toBe("foo");
  });

  it("grouping", () => {
    const grouping = factory.grouping("one" as unknown as Nodes.Node);
    expect(grouping).toBeInstanceOf(Nodes.Grouping);
    expect(grouping.expr).toBe("one");
  });

  it("create on", () => {
    const on = factory.createOn("one" as unknown as Nodes.Node);
    expect(on).toBeInstanceOf(Nodes.On);
    expect(on.expr).toBe("one");
  });

  it("create true", () => {
    const trueNode = factory.createTrue();
    expect(trueNode).toBeInstanceOf(Nodes.True);
  });

  it("create false", () => {
    const falseNode = factory.createFalse();
    expect(falseNode).toBeInstanceOf(Nodes.False);
  });

  it("lower", () => {
    const lower = factory.lower("one");
    expect(lower).toBeInstanceOf(Nodes.NamedFunction);
    expect(lower.name).toBe("LOWER");
    expect((lower.expressions as Nodes.NodeOrValue[]).map((e) => (e as Nodes.Quoted).expr)).toEqual(
      ["one"],
    );
  });

  it("coalesce", () => {
    const relation = new Table("users");
    const fieldNode = relation.get("active");
    const coalesce = factory.coalesce(fieldNode, 0);
    expect(coalesce).toBeInstanceOf(Nodes.NamedFunction);
    expect(coalesce.name).toBe("COALESCE");
    expect(coalesce.expressions).toEqual([fieldNode, 0]);
  });

  it("cast", () => {
    const relation = new Table("users");
    const fieldNode = relation.get("active");
    const cast = factory.cast(fieldNode, "boolean");
    expect(cast).toBeInstanceOf(Nodes.NamedFunction);
    expect(cast.name).toBe("CAST");
    const asNode = (cast.expressions as Nodes.NodeOrValue[])[0];
    expect(asNode).toBeInstanceOf(Nodes.As);
    expect((asNode as Nodes.As).left).toBe(fieldNode);
    expect(String((asNode as Nodes.As).right)).toBe("boolean");
  });
});
