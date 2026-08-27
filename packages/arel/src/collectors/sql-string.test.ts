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
    const sql = compile(astWithBinds());
    // A JS string carries no encoding tag, so the nearest expressible form of
    // Rails' `assert_equal sql.encoding, Encoding::UTF_8`
    // (collectors/sql_string_test.rb:35-38) is a strict UTF-8 round trip.
    expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(sql))).toBe(
      sql,
    );
  });

  it("compile", () => {
    const sql = compile(astWithBinds());
    expect(sql).toBe('SELECT FROM "users" WHERE "users"."age" = ? AND "users"."name" = ?');
  });
});
