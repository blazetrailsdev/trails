import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Collectors, Nodes, SelectManager, Table, Visitors } from "../index.js";

describe("TestBind", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const compile = (node: Nodes.Node): unknown[] =>
    visitor.accept(node, new Collectors.Bind()).value;

  const astWithBinds = (bvs: unknown[]): Nodes.Node => {
    const table = new Table("users");
    const manager = new SelectManager(table);
    manager.where(table.get("age").eq(new Nodes.BindParam(bvs.shift())));
    manager.where(table.get("name").eq(new Nodes.BindParam(bvs.shift())));
    return manager.ast;
  };

  it("compile gathers all bind params", () => {
    let binds = compile(astWithBinds(["hello", "world"]));
    expect(binds).toEqual(["hello", "world"]);

    binds = compile(astWithBinds(["hello2", "world3"]));
    expect(binds).toEqual(["hello2", "world3"]);
  });
});
