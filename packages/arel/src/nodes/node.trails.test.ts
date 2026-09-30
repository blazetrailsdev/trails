import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";
import { Table } from "../table.js";
import { assertNotSame } from "../test-helpers/assertions.js";

describe("Arel::Nodes::Node#dup", () => {
  it("copies a node with no initialize_copy shallowly, sharing its children", () => {
    const users = new Table("users");
    const extract = users.get("timestamp").extract("date");
    const dolly = extract.dup();
    expect(dolly).toBeInstanceOf(Nodes.Extract);
    assertNotSame(extract, dolly);
    expect(dolly.expr).toBe(extract.expr);
  });

  it("runs initialize_copy, copying the cores of a SelectStatement", () => {
    const statement = new Nodes.SelectStatement();
    const dolly = statement.dup();
    expect(dolly.cores).toEqual(statement.cores);
    assertNotSame(statement.cores, dolly.cores);
  });

  it("does not carry the receiver's frozen state", () => {
    const node = Object.freeze(new Nodes.SelectStatement());
    expect(Object.isFrozen(node.dup())).toBe(false);
  });
});
