import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";

describe("TestInfixOperation", () => {
  const users = new Table("users");
  it("construct", () => {
    const a = users.get("age");
    const b = new Nodes.Quoted(10);
    const node = new Nodes.InfixOperation("||", a, b);
    expect(node.operator).toBe("||");
    expect(node.left).toBe(a);
    expect(node.right).toBe(b);
  });

  it("operation alias", () => {
    const node = new Nodes.InfixOperation("+", users.get("a"), users.get("b"));
    const aliased = node.as("total");
    expect(aliased).toBeInstanceOf(Nodes.As);
  });

  it("operation ordering", () => {
    const node = new Nodes.UnaryOperation("-", users.get("age"));
    expect(node.asc()).toBeInstanceOf(Nodes.Ascending);
    expect(node.desc()).toBeInstanceOf(Nodes.Descending);
  });

  it("equality with same ivars", () => {
    const a = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
    const b = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
    expect(a.operator).toBe(b.operator);
  });

  it("inequality with different ivars", () => {
    const a = new Nodes.InfixOperation("+", users.get("x"), new Nodes.Quoted(1));
    const b = new Nodes.InfixOperation("-", users.get("x"), new Nodes.Quoted(1));
    expect(a.operator).not.toBe(b.operator);
  });
});
