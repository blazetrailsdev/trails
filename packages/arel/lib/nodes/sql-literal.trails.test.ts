import { describe, it, expect } from "vitest";
import { Nodes, arelNode } from "../index.js";

describe("SqlLiteralTest (trails)", () => {
  it("to_s returns the sql text", () => {
    const node = new Nodes.SqlLiteral("id * 2");
    expect(node.toString()).toBe("id * 2");
    expect(String(node)).toBe("id * 2");
    expect(`${node}`).toBe("id * 2");
  });

  it("eql? compares by sql text", () => {
    const node = new Nodes.SqlLiteral("id * 2");
    expect(node.eql("id * 2")).toBe(true);
    expect(node.eql("id * 3")).toBe(false);
    expect(node.eql(new Nodes.SqlLiteral("id * 2", { retryable: true }))).toBe(true);
    expect(node.eql(new Nodes.SqlLiteral("id * 3"))).toBe(false);
  });

  it("is a String, not a Node, and an arel_node?", () => {
    const node = new Nodes.SqlLiteral("id * 2");
    expect(node).not.toBeInstanceOf(Nodes.Node);
    expect("not" in node).toBe(false);
    expect(arelNode(node)).toBe(true);
    expect(Nodes.buildQuoted(node)).toBe(node);
  });
});
