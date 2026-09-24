import { describe, it, expect } from "vitest";
import * as Arel from "./index.js";
import * as NodesModule from "./nodes/index.js";
import { Nodes, Visitors } from "./namespaces.js";

describe("Arel namespaces", () => {
  it("public Nodes and Visitors are the objects constants resolve against", () => {
    expect(Arel.Nodes).toBe(Nodes);
    expect(Arel.Visitors).toBe(Visitors);
  });

  it("every node class seats itself on Nodes", () => {
    for (const [name, value] of Object.entries(NodesModule)) {
      expect(Nodes[name as keyof typeof NodesModule], name).toBe(value);
    }
  });

  it("Nodes.buildQuoted is reachable publicly", () => {
    expect(Arel.Nodes.buildQuoted("foo")).toBeInstanceOf(Arel.Nodes.Quoted);
  });

  it("every visitor seats itself on Visitors", () => {
    for (const name of [
      "ToSql",
      "UnsupportedVisitError",
      "MySQL",
      "PostgreSQL",
      "SQLite",
      "Dot",
      "Visitor",
    ] as const) {
      expect(typeof Visitors[name], name).toBe("function");
    }
  });
});
