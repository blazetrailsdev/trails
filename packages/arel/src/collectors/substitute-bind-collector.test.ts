import { describe, it, expect } from "vitest";
import { Collectors, Nodes, SelectManager, Table, Visitors } from "../index.js";
import { fakeRecordConnection } from "../test-helpers/connection.js";

describe("TestSubstituteBindCollector", () => {
  const visitor = new Visitors.ToSql(fakeRecordConnection);

  function astWithBinds(): Nodes.SelectStatement {
    const table = new Table("users");
    const manager = new SelectManager(table);
    manager.where(table.get("age").eq(new Nodes.BindParam("hello")));
    manager.where(table.get("name").eq(new Nodes.BindParam("world")));
    return manager.ast;
  }

  function compile(node: Nodes.SelectStatement, quoter: { quote(value: unknown): string }): string {
    const collector = new Collectors.SubstituteBinds(quoter, new Collectors.SQLString());
    return visitor.accept(node, collector).value;
  }

  it("compile", () => {
    const quoter = { quote: (val: unknown) => String(val) };
    const sql = compile(astWithBinds(), quoter);
    expect(sql).toBe('SELECT FROM "users" WHERE "users"."age" = hello AND "users"."name" = world');
  });

  it("quoting is delegated to quoter", () => {
    const quoter = { quote: (val: unknown) => JSON.stringify(val) };
    const sql = compile(astWithBinds(), quoter);
    expect(sql).toBe(
      'SELECT FROM "users" WHERE "users"."age" = "hello" AND "users"."name" = "world"',
    );
  });
});
