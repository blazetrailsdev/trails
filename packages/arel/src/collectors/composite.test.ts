import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Collectors, Nodes, SelectManager, Table, Visitors } from "../index.js";

describe("TestComposite", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const compile = (node: Nodes.Node): [string, unknown[]] => {
    const sqlCollector = new Collectors.SQLString();
    const bindCollector = new Collectors.Bind();
    const collector = new Collectors.Composite(sqlCollector, bindCollector);
    return visitor.accept(node, collector).value as [string, unknown[]];
  };

  const astWithBinds = (bvs: unknown[]): Nodes.Node => {
    const table = new Table("users");
    const manager = new SelectManager(table);
    manager.where(table.get("age").eq(new Nodes.BindParam(bvs.shift())));
    manager.where(table.get("name").eq(new Nodes.BindParam(bvs.shift())));
    return manager.ast;
  };

  it("composite collector performs multiple collections at once", () => {
    let [sql, binds] = compile(astWithBinds(["hello", "world"]));
    expect(sql).toBe('SELECT FROM "users" WHERE "users"."age" = ? AND "users"."name" = ?');
    expect(binds).toEqual(["hello", "world"]);

    [sql, binds] = compile(astWithBinds(["hello2", "world3"]));
    expect(sql).toBe('SELECT FROM "users" WHERE "users"."age" = ? AND "users"."name" = ?');
    expect(binds).toEqual(["hello2", "world3"]);
  });

  it("retryable on composite collector propagates", () => {
    const sqlCollector = new Collectors.SQLString();
    const bindCollector = new Collectors.Bind();
    const collector = new Collectors.Composite(sqlCollector, bindCollector);
    collector.retryable = true;

    expect(sqlCollector.retryable).toBeTruthy();
    expect(bindCollector.retryable).toBeTruthy();
  });
});
