// Trails-only cases with no Rails counterpart: Ruby gets `Object#clone`'s
// copy-every-ivar semantics from core, so no Rails test asserts them. In TS
// each `clone()` has to build the copy itself, and these pin the two ways that
// can silently diverge — a field the body forgot to copy, and a bound instance
// property carried over still closed over the original (RFC 0124).
import { describe, it, expect } from "vitest";
import { Table, Nodes, SelectManager } from "./index.js";
import { objectClone } from "./clone-support.js";

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
      const copy = (node as { clone(): object }).clone();
      expect(Object.getPrototypeOf(copy)).toBe(Object.getPrototypeOf(node));
      expect((copy as { unnamedField?: string }).unnamedField).toBe("carried");
    }
  });

  it("gives Case#when on the clone the clone's own conditions", () => {
    const node = new Nodes.Case(users.get("id"));
    node.when(1, 2);
    const copy = node.clone();
    copy.when(3, 4);

    expect(node.conditions.length).toBe(1);
    expect(copy.conditions.length).toBe(2);
  });

  // NamedFunction has no `initialize_copy`, so Ruby clones it with bare
  // `Object#clone` — `objectClone` is what that spells here.
  it("gives NamedFunction#over on the clone the clone as its operand", () => {
    const node = new Nodes.NamedFunction("row_number", []);
    const copy = objectClone(node);

    expect(node.over().left).toBe(node);
    expect(copy.over().left).toBe(copy);
  });

  it("gives Fragments its own values array", () => {
    const node = new Nodes.Fragments([]);
    const copy = node.clone();
    copy.values.push(new Nodes.SqlLiteral("x"));

    expect(node.values.length).toBe(0);
    expect(copy.values.length).toBe(1);
  });
});
