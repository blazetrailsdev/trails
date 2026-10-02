import { describe, it, expect } from "vitest";
import * as Arel from "./index.js";
import * as NodesModule from "./nodes/index.js";
import { Collectors, Nodes, Visitors } from "./namespaces.js";
import { rbModName } from "@blazetrails/ruby-compat";

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

  it("public Collectors is the object its constants resolve against", () => {
    expect(Arel.Collectors).toBe(Collectors);
    expect(Collectors.SQLString).toBe(Arel.Collectors.SQLString);
  });

  it("the managers, collectors, errors and Dot's Node and Edge answer their Rails path", () => {
    const arel = ["DeleteManager", "InsertManager", "UpdateManager", "TreeManager"] as const;
    for (const name of [...arel, "ArelError", "EmptyJoinError", "BindError"] as const) {
      expect(rbModName(Arel[name])).toBe(`Arel::${name}`);
    }
    for (const name of ["Bind", "Composite", "PlainString", "SQLString"] as const) {
      expect(rbModName(Collectors[name])).toBe(`Arel::Collectors::${name}`);
    }
    expect(rbModName(Collectors.SubstituteBinds)).toBe("Arel::Collectors::SubstituteBinds");
    const { Node, Edge } = Visitors.Dot as unknown as Record<string, new () => unknown>;
    expect(rbModName(Node)).toBe("Arel::Visitors::Dot::Node");
    expect(rbModName(Edge)).toBe("Arel::Visitors::Dot::Edge");
  });
});
