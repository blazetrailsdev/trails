import { describe, it, expect } from "vitest";
import { Nodes } from "../index.js";

// Ruby's `Module#ancestors`, which the Rails body greps for `Nodes::Node`.
function ancestors(klass: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let k: unknown = klass; k; k = Object.getPrototypeOf(k) as unknown) chain.push(k);
  return chain;
}

describe("TestNode", () => {
  it("includes factory methods", () => {
    expect(typeof new Nodes.Node().createJoin === "function").toBeTruthy();
  });

  it("all nodes are nodes", () => {
    for (const klass of Object.values(Nodes) as unknown[]) {
      if (typeof klass !== "function") continue;
      // Ruby's `.grep(Class)` — a plain function (`buildQuoted`) is not one.
      if (Object.getOwnPropertyDescriptor(klass as object, "prototype")?.writable !== false) {
        continue;
      }
      if (Nodes.SqlLiteral === klass) continue;
      if (Nodes.BindParam === klass) continue;
      expect(ancestors(klass)).toContain(Nodes.Node);
    }
  });
});
