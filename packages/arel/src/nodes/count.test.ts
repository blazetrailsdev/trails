import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors } from "../index.js";
import type { Node } from "./node.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::CountTest", () => {
  const users = new Table("users");
  describe("as", () => {
    it("should alias the count", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("id").count().as("foo"),
      );
      expect(sql).toBe('COUNT("users"."id") AS foo');
    });
  });

  describe("eq", () => {
    it("should compare the count", () => {
      const count = users.get("id").count();
      expect(count).toBeInstanceOf(Nodes.Count);
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [
        new Nodes.Count("foo" as unknown as Node),
        new Nodes.Count("foo" as unknown as Node),
      ];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [
        new Nodes.Count("foo" as unknown as Node),
        new Nodes.Count("foo!" as unknown as Node),
      ];
      expect(uniq(array).length).toBe(2);
    });
  });
});
