import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

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
});
