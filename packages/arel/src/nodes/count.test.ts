import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::CountTest", () => {
  describe("as", () => {
    it("should alias the count", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().as("foo").toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") AS foo
      `),
      );
    });
  });

  describe("eq", () => {
    it("should compare the count", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().eq(2).toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") = 2
      `),
      );
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [new Nodes.Count("foo"), new Nodes.Count("foo")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [new Nodes.Count("foo"), new Nodes.Count("foo!")];
      expect(uniq(array).length).toBe(2);
    });
  });
});
