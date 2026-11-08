import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager } from "./index.js";
import { rbObjClone } from "@blazetrails/ruby-compat";

describe("Arel clone", () => {
  const users = new Table("users");

  it("carries a field the clone body does not name", () => {
    const cases: object[] = [
      new Nodes.Case(users.get("id")),
      new Nodes.SelectCore(),
      new Nodes.SelectStatement(),
      new Nodes.InsertStatement(),
      new Nodes.UpdateStatement(),
      new Nodes.DeleteStatement(),
      new Nodes.Equality(users.get("id"), 1),
      new Nodes.Fragments([]),
      new SelectManager(users),
    ];

    for (const node of cases) {
      (node as { unnamedField?: string }).unnamedField = "carried";
      const copy = rbObjClone(node);
      expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(node));
      expect((copy as { unnamedField?: string }).unnamedField).toBe("carried");
    }
  });

  it("gives Case#when on the clone the clone's own conditions", () => {
    const node = new Nodes.Case(users.get("id"));
    node.when(1, 2);
    const copy = rbObjClone(node);
    copy.when(3, 4);

    expect(node.conditions.length).toBe(1);
    expect(copy.conditions.length).toBe(2);
  });

  it("gives NamedFunction#over on the clone the clone as its operand", () => {
    const node = new Nodes.NamedFunction("row_number", []);
    const copy = rbObjClone(node);

    expect(node.over().left).toBe(node);
    expect(copy.over().left).toBe(copy);
  });

  it("gives Fragments its own values array", () => {
    const node = new Nodes.Fragments([]);
    const copy = rbObjClone(node);
    copy.values.push(new Nodes.SqlLiteral("x"));

    expect(node.values.length).toBe(0);
    expect(copy.values.length).toBe(1);
  });

  it("gives NamedWindow#order on the clone the clone's own orders", () => {
    const node = new Nodes.NamedWindow("w");
    node.order("a");
    const copy = rbObjClone(node);
    copy.order("b");

    expect(node.orders.length).toBe(1);
    expect(copy.orders.length).toBe(2);
    expect(copy.name).toBe("w");
  });

  it("clones a Binary's array operand as an array", () => {
    const node = new Nodes.In(users.get("id"), [new Nodes.Quoted(1)]);
    const copy = rbObjClone(node);

    expect(Array.isArray(copy.right)).toBe(true);
    expect(copy.right).not.toBe(node.right);
    expect(copy.right).toEqual(node.right);
  });
});
