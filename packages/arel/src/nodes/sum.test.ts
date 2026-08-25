import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::SumTest", () => {
  const users = new Table("users");
  describe("as", () => {
    it("should alias the sum", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(users.get("id").sum().as("foo"));
      expect(sql).toBe('SUM("users"."id") AS foo');
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [
        new Nodes.Sum(["foo"] as unknown as Node[]),
        new Nodes.Sum(["foo"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [
        new Nodes.Sum(["foo"] as unknown as Node[]),
        new Nodes.Sum(["foo!"] as unknown as Node[]),
      ];
      expect(uniq(array).length).toBe(2);
    });
  });

  it("should order the sum via sql", () => {
    const sum = users.get("age").sum();
    expect(users.project(sum).order(users.get("name").asc()).toSql()).toContain("ORDER BY");
  });

  describe("order", () => {
    it("should order the sum", () => {
      const win = new Nodes.Window().order(users.get("name").asc());
      const sumOver = users.get("age").sum().over(win);
      const sql = users.project(sumOver).toSql();
      expect(sql).toContain("OVER");
      expect(sql).toContain("ORDER BY");
    });
  });
});
