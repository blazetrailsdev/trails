import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import type { Node } from "./node.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::SumTest", () => {
  describe("as", () => {
    it("should alias the sum", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").sum().as("foo").toSql())).toBe(
        mustBeLike(`
        SUM("users"."id") AS foo
      `),
      );
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

  describe("order", () => {
    it("should order the sum", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").sum().desc().toSql())).toBe(
        mustBeLike(`
        SUM("users"."id") DESC
      `),
      );
    });
  });
});
