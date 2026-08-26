import { describe, it, expect } from "vitest";
import { Table, Nodes } from "../index.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";

describe("FilterTest", () => {
  describe("Filter", () => {
    it("should add filter to expression", () => {
      const table = new Table("users");
      expect(
        mustBeLike(table.get("id").count().filter(table.get("income").gteq(40_000)).toSql()),
      ).toBe(
        mustBeLike(`
              COUNT("users"."id") FILTER (WHERE "users"."income" >= 40000)
            `),
      );
    });

    describe("as", () => {
      it("should alias the expression", () => {
        const table = new Table("users");
        expect(
          mustBeLike(
            table
              .get("id")
              .count()
              .filter(table.get("income").gteq(40_000))
              .as("rich_users_count")
              .toSql(),
          ),
        ).toBe(
          mustBeLike(`
              COUNT("users"."id") FILTER (WHERE "users"."income" >= 40000) AS rich_users_count
            `),
        );
      });
    });

    describe("over", () => {
      it("should reference the window definition by name", () => {
        const table = new Table("users");
        const window = new Nodes.Window().partition(table.get("year"));
        expect(
          mustBeLike(
            table.get("id").count().filter(table.get("income").gteq(40_000)).over(window).toSql(),
          ),
        ).toBe(
          mustBeLike(`
              COUNT("users"."id") FILTER (WHERE "users"."income" >= 40000) OVER (PARTITION BY "users"."year")
            `),
        );
      });
    });
  });
});
