import { describe, it, expect, beforeEach } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { Table, sql, Nodes, Visitors, Collectors } from "../index.js";

describe("SqliteTest", () => {
  let visitor: Visitors.SQLite;
  beforeEach(() => {
    visitor = new Visitors.SQLite(fakeRecordConnection);
  });

  function compile(node: Nodes.Node): string {
    return visitor.accept(node, new Collectors.SQLString()).value;
  }

  it("defaults limit to -1", () => {
    const stmt = new Nodes.SelectStatement();
    stmt.offset = new Nodes.Offset(1);
    const sql = visitor.accept(stmt, new Collectors.SQLString()).value;
    expect(mustBeLike(sql)).toBe(mustBeLike("SELECT LIMIT -1 OFFSET 1"));
  });

  it("does not support locking", () => {
    const node = new Nodes.Lock(sql("FOR UPDATE"));
    expect(visitor.accept(node, new Collectors.SQLString()).value).toBe("");
  });

  it("does not support boolean", () => {
    let node: Nodes.Node = new Nodes.True();
    expect(visitor.accept(node, new Collectors.SQLString()).value).toBe("1");
    node = new Nodes.False();
    expect(visitor.accept(node, new Collectors.SQLString()).value).toBe("0");
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should construct a valid generic SQL statement", () => {
      const test = new Table("users").get("name").isNotDistinctFrom("Aaron Patterson");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."name" IS 'Aaron Patterson'`));
    });

    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isNotDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const table = new Table("users");
      const val = Nodes.buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.IsNotDistinctFrom(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NULL`));
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NOT "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const table = new Table("users");
      const val = Nodes.buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.IsDistinctFrom(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NOT NULL`));
    });
  });
});
