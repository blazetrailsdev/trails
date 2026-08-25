import { describe, it, expect, beforeEach } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { buildQuoted } from "../nodes/casted.js";
import { Table, star, sql, Nodes, Visitors, Collectors } from "../index.js";

describe("MysqlTest", () => {
  let visitor: Visitors.MySQL;
  beforeEach(() => {
    visitor = new Visitors.MySQL(fakeRecordConnection);
  });

  function compile(node: Nodes.Node): string {
    return visitor.accept(node, new Collectors.SQLString()).value;
  }

  it("defaults limit to 18446744073709551615", () => {
    const stmt = new Nodes.SelectStatement();
    stmt.offset = new Nodes.Offset(1);
    const compiled = compile(stmt);
    expect(mustBeLike(compiled)).toBe(
      mustBeLike("SELECT FROM DUAL LIMIT 18446744073709551615 OFFSET 1"),
    );
  });

  it("should escape LIMIT", () => {
    const sc = new Nodes.UpdateStatement();
    sc.relation = new Table("users");
    sc.limit = new Nodes.Limit(buildQuoted("omg"));
    expect(compile(sc)).toBe(`UPDATE "users" LIMIT 'omg'`);
  });

  it("uses DUAL for empty from", () => {
    const stmt = new Nodes.SelectStatement();
    const compiled = compile(stmt);
    expect(mustBeLike(compiled)).toBe(mustBeLike("SELECT FROM DUAL"));
  });

  describe("locking", () => {
    it("defaults to FOR UPDATE when locking", () => {
      const node = new Nodes.Lock(sql("FOR UPDATE"));
      expect(mustBeLike(compile(node))).toBe(mustBeLike("FOR UPDATE"));
    });

    it("allows a custom string to be used as a lock", () => {
      const node = new Nodes.Lock(sql("LOCK IN SHARE MODE"));
      expect(mustBeLike(compile(node))).toBe(mustBeLike("LOCK IN SHARE MODE"));
    });
  });

  describe("concat", () => {
    it("concats columns", () => {
      const table = new Table("users");
      const query = table.get("name").concat(table.get("name"));
      expect(mustBeLike(compile(query))).toBe(mustBeLike(`CONCAT("users"."name", "users"."name")`));
    });

    it("concats a string", () => {
      const table = new Table("users");
      const query = table.get("name").concat(buildQuoted("abc"));
      expect(mustBeLike(compile(query))).toBe(mustBeLike(`CONCAT("users"."name", 'abc')`));
    });
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should construct a valid generic SQL statement", () => {
      const test = new Table("users").get("name").isNotDistinctFrom("Aaron Patterson");
      expect(mustBeLike(compile(test))).toBe(mustBeLike(`"users"."name" <=> 'Aaron Patterson'`));
    });

    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isNotDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" <=> "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const table = new Table("users");
      const val = buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.IsNotDistinctFrom(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" <=> NULL`));
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`NOT "users"."first_name" <=> "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const table = new Table("users");
      const val = buildQuoted(null, table.get("active"));
      const compiled = compile(new Nodes.IsDistinctFrom(table.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`NOT "users"."name" <=> NULL`));
    });
  });

  describe("Nodes::Regexp", () => {
    let table: Table;
    let attr: Nodes.Attribute;
    beforeEach(() => {
      table = new Table("users");
      attr = table.get("id");
    });

    it("should know how to visit", () => {
      const node = table.get("name").matchesRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" REGEXP 'foo.*'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").matchesRegexp("foo.*"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" REGEXP 'foo.*')`),
      );
    });
  });

  describe("Nodes::NotRegexp", () => {
    let table: Table;
    let attr: Nodes.Attribute;
    beforeEach(() => {
      table = new Table("users");
      attr = table.get("id");
    });

    it("should know how to visit", () => {
      const node = table.get("name").doesNotMatchRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" NOT REGEXP 'foo.*'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").doesNotMatchRegexp("foo.*"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(
          `"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" NOT REGEXP 'foo.*')`,
        ),
      );
    });
  });

  describe("Nodes::Ordering", () => {
    it("should handle nulls first", () => {
      const test = new Table("users").get("first_name").asc().nullsFirst();
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NOT NULL, "users"."first_name" ASC`),
      );
    });

    it("should handle nulls last", () => {
      const test = new Table("users").get("first_name").asc().nullsLast();
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NULL, "users"."first_name" ASC`),
      );
    });

    it("should handle nulls first reversed", () => {
      const test = new Table("users").get("first_name").asc().nullsFirst().reverse();
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NULL, "users"."first_name" DESC`),
      );
    });

    it("should handle nulls last reversed", () => {
      const test = new Table("users").get("first_name").asc().nullsLast().reverse();
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NOT NULL, "users"."first_name" DESC`),
      );
    });
  });

  describe("Nodes::Cte", () => {
    it("ignores MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star()).ast, true);
      expect(mustBeLike(compile(cte))).toBe(mustBeLike(`"foo" AS (SELECT * FROM "bar")`));
    });

    it("ignores NOT MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("foo", new Table("bar").project(star()).ast, false);
      expect(mustBeLike(compile(cte))).toBe(mustBeLike(`"foo" AS (SELECT * FROM "bar")`));
    });
  });
});
