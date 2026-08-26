import { describe, it, expect } from "vitest";
import { fakeRecordConnection, mysqlTestConnection } from "../test-helpers/connection.js";
import { sql, Nodes, Visitors } from "../index.js";
import { uniq } from "../test-helpers/uniq.js";

describe("TestBin", () => {
  it("new", () => {
    expect(new Nodes.Bin("zomg")).toBeTruthy();
  });

  it("default to sql", () => {
    const viz = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.Bin(sql("zomg"));
    expect(viz.compile(node)).toBe("zomg");
  });

  it("mysql to sql", () => {
    const viz = new Visitors.MySQL(mysqlTestConnection);
    const node = new Nodes.Bin(sql("zomg"));
    expect(viz.compile(node)).toBe("CAST(zomg AS BINARY)");
  });

  it("equality with same ivars", () => {
    const array = [new Nodes.Bin("zomg"), new Nodes.Bin("zomg")];
    expect(uniq(array).length).toBe(1);
  });

  it("inequality with different ivars", () => {
    const array = [new Nodes.Bin("zomg"), new Nodes.Bin("zomg!")];
    expect(uniq(array).length).toBe(2);
  });
});
