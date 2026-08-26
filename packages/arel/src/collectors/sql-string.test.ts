import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Collectors, Nodes, SelectManager, Table, Visitors } from "../index.js";

describe("TestSqlString", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);
  const compile = (node: Nodes.Node): string =>
    visitor.accept(node, new Collectors.SQLString()).value;

  const astWithBinds = (): Nodes.Node => {
    const table = new Table("users");
    const manager = new SelectManager(table);
    manager.where(table.get("age").eq(new Nodes.BindParam("hello")));
    manager.where(table.get("name").eq(new Nodes.BindParam("world")));
    return manager.ast;
  };

  it("returned sql uses utf8 encoding", () => {
    const collector = new Collectors.SQLString();
    collector.append("SELECT");
    const result = collector.value;
    expect(typeof result).toBe("string");
  });

  it("compile", () => {
    const sql = compile(astWithBinds());
    expect(sql).toBe('SELECT FROM "users" WHERE "users"."age" = ? AND "users"."name" = ?');
  });
});
