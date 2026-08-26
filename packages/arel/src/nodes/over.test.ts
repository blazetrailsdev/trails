import { describe, it, expect } from "vitest";
import { sql, Table, Nodes } from "../index.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { uniq } from "../test-helpers/uniq.js";

describe("Arel::Nodes::OverTest", () => {
  describe("as", () => {
    it("should alias the expression", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().over().as("foo").toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") OVER () AS foo
      `),
      );
    });
  });

  describe("with literal", () => {
    it("should reference the window definition by name", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().over("foo").toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") OVER "foo"
      `),
      );
    });
  });

  describe("with SQL literal", () => {
    it("should reference the window definition by name", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().over(sql("foo")).toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") OVER foo
      `),
      );
    });
  });

  describe("with no expression", () => {
    it("should use empty definition", () => {
      const table = new Table("users");
      expect(mustBeLike(table.get("id").count().over().toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") OVER ()
      `),
      );
    });
  });

  describe("with expression", () => {
    it("should use definition in sub-expression", () => {
      const table = new Table("users");
      const window = new Nodes.Window().order(table.get("foo"));
      expect(mustBeLike(table.get("id").count().over(window).toSql())).toBe(
        mustBeLike(`
        COUNT("users"."id") OVER (ORDER BY "users"."foo")
      `),
      );
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const array = [new Nodes.Over("foo", "bar"), new Nodes.Over("foo", "bar")];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const array = [new Nodes.Over("foo", "bar"), new Nodes.Over("foo", "baz")];
      expect(uniq(array).length).toBe(2);
    });
  });
});
