import { describe, it, expect } from "vitest";
import { fakeRecordConnection, mysqlTestConnection } from "../test-helpers/connection.js";
import { Nodes, Visitors } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("TestBin", () => {
  it("new", () => {
    const node = new Nodes.Bin("zomg");
    expect(node).toBeInstanceOf(Nodes.Bin);
  });

  it("equality with same ivars", () => {
    const array = [new Nodes.Bin("zomg"), new Nodes.Bin("zomg")];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [new Nodes.Bin("zomg"), new Nodes.Bin("zomg!")];
    expect(uniq(array).length).toBe(2);
  });

  it("default to sql", () => {
    const node = new Nodes.Bin(new Nodes.SqlLiteral("zomg"));
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
    expect(sql).toBe("zomg");
  });

  it("mysql to sql", () => {
    // Rails MySQL: visit_Arel_Nodes_Bin emits `CAST(... AS BINARY)`.
    const node = new Nodes.Bin(new Nodes.SqlLiteral("zomg"));
    const sql = new Visitors.MySQL(mysqlTestConnection).compile(node);
    expect(sql).toBe("CAST(zomg AS BINARY)");
  });
});
