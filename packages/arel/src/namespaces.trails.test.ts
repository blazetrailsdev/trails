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

  it("a class is named by the constant binding that seats it", () => {
    expect(rbModName(Nodes.Not)).toBe("Arel::Nodes::Not");
    expect(rbModName(Arel.Attribute)).toBe("Arel::Attributes::Attribute");
    expect(rbModName(Visitors.ToSql)).toBe("Arel::Visitors::ToSql");
    expect(rbModName(Arel.Table)).toBe("Arel::Table");
  });

  it("the managers, collectors, errors and Dot's Node and Edge answer their Rails path", () => {
    expect(
      [Arel.DeleteManager, Arel.InsertManager, Arel.UpdateManager, Arel.TreeManager].map(rbModName),
    ).toEqual([
      "Arel::DeleteManager",
      "Arel::InsertManager",
      "Arel::UpdateManager",
      "Arel::TreeManager",
    ]);
    for (const name of [
      "Bind",
      "Composite",
      "PlainString",
      "SQLString",
      "SubstituteBinds",
    ] as const) {
      expect(rbModName(Collectors[name])).toBe(`Arel::Collectors::${name}`);
    }
    expect([Arel.ArelError, Arel.EmptyJoinError, Arel.BindError].map(rbModName)).toEqual([
      "Arel::ArelError",
      "Arel::EmptyJoinError",
      "Arel::BindError",
    ]);
    const { Node, Edge } = Visitors.Dot as unknown as Record<string, new () => unknown>;
    expect([Node, Edge].map(rbModName)).toEqual([
      "Arel::Visitors::Dot::Node",
      "Arel::Visitors::Dot::Edge",
    ]);
  });
});
