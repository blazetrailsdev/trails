import { describe, it, expect } from "vitest";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { Table, sql, Nodes, Visitors, Collectors } from "../index.js";
import { buildQuoted } from "../nodes/casted.js";

describe("PostgresTest", () => {
  const visitor = new Visitors.PostgreSQL(fakeRecordConnection);
  const table = new Table("users");
  const attr = table.get("id");

  const compile = (node: Nodes.Node): string =>
    visitor.compile(node, new Collectors.SQLString()) as unknown as string;

  describe("locking", () => {
    it("defaults to FOR UPDATE", () => {
      expect(mustBeLike(compile(new Nodes.Lock(sql("FOR UPDATE"))))).toBe(mustBeLike(`FOR UPDATE`));
    });

    it("allows a custom string to be used as a lock", () => {
      const node = new Nodes.Lock(sql("FOR SHARE"));
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`FOR SHARE`));
    });
  });

  it("should escape LIMIT", () => {
    const sc = new Nodes.SelectStatement();
    sc.limit = new Nodes.Limit(buildQuoted("omg"));
    sc.cores[0].projections.push(sql("DISTINCT ON"));
    sc.orders.push(sql("xyz"));
    const compiled = compile(sc);
    expect(compiled).toMatch(/LIMIT 'omg'/);
    expect(compiled.match(/LIMIT/g)?.length).toBe(1);
  });

  it("should support DISTINCT ON", () => {
    const core = new Nodes.SelectCore();
    core.setQuantifier = new Nodes.DistinctOn(sql("aaron"));
    expect(compile(core)).toMatch("DISTINCT ON ( aaron )");
  });

  it("should support DISTINCT", () => {
    const core = new Nodes.SelectCore();
    core.setQuantifier = new Nodes.Distinct();
    expect(compile(core)).toBe("SELECT DISTINCT");
  });

  it("encloses LATERAL queries in parens", () => {
    const subquery = table.project("id").where(table.get("name").matches("foo%"));
    expect(mustBeLike(compile(subquery.lateral()))).toBe(
      mustBeLike(`LATERAL (SELECT id FROM "users" WHERE "users"."name" ILIKE 'foo%')`),
    );
  });

  it("produces LATERAL queries with alias", () => {
    const subquery = table.project("id").where(table.get("name").matches("foo%"));
    expect(mustBeLike(compile(subquery.lateral("bar")))).toBe(
      mustBeLike(`LATERAL (SELECT id FROM "users" WHERE "users"."name" ILIKE 'foo%') bar`),
    );
  });

  describe("Nodes::Matches", () => {
    it("should know how to visit", () => {
      const node = table.get("name").matches("foo%");
      expect(node).toBeInstanceOf(Nodes.Matches);
      expect(node.caseSensitive).toBe(false);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" ILIKE 'foo%'`));
    });

    it("should know how to visit case sensitive", () => {
      const node = table.get("name").matches("foo%", null, true);
      expect(node.caseSensitive).toBe(true);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" LIKE 'foo%'`));
    });

    it("can handle ESCAPE", () => {
      const node = table.get("name").matches("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" ILIKE 'foo!%' ESCAPE '!'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").matches("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" ILIKE 'foo%')`),
      );
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("should know how to visit", () => {
      const node = table.get("name").doesNotMatch("foo%");
      expect(node).toBeInstanceOf(Nodes.DoesNotMatch);
      expect(node.caseSensitive).toBe(false);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" NOT ILIKE 'foo%'`));
    });

    it("should know how to visit case sensitive", () => {
      const node = table.get("name").doesNotMatch("foo%", null, true);
      expect(node.caseSensitive).toBe(true);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" NOT LIKE 'foo%'`));
    });

    it("can handle ESCAPE", () => {
      const node = table.get("name").doesNotMatch("foo!%", "!");
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."name" NOT ILIKE 'foo!%' ESCAPE '!'`),
      );
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").doesNotMatch("foo%"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(
          `"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" NOT ILIKE 'foo%')`,
        ),
      );
    });
  });

  describe("Nodes::Regexp", () => {
    it("should know how to visit", () => {
      const node = table.get("name").matchesRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.caseSensitive).toBe(true);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" ~ 'foo.*'`));
    });

    it("can handle case insensitive", () => {
      const node = table.get("name").matchesRegexp("foo.*", false);
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.caseSensitive).toBe(false);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" ~* 'foo.*'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").matchesRegexp("foo.*"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" ~ 'foo.*')`),
      );
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("should know how to visit", () => {
      const node = table.get("name").doesNotMatchRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(node.caseSensitive).toBe(true);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" !~ 'foo.*'`));
    });

    it("can handle case insensitive", () => {
      const node = table.get("name").doesNotMatchRegexp("foo.*", false);
      expect(node.caseSensitive).toBe(false);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`"users"."name" !~* 'foo.*'`));
    });

    it("can handle subqueries", () => {
      const subquery = table.project("id").where(table.get("name").doesNotMatchRegexp("foo.*"));
      const node = attr.in(subquery);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`"users"."id" IN (SELECT id FROM "users" WHERE "users"."name" !~ 'foo.*')`),
      );
    });
  });

  describe("Nodes::BindParam", () => {
    it("increments each bind param", () => {
      const query = table
        .get("name")
        .eq(new Nodes.BindParam(1))
        .and(table.get("id").eq(new Nodes.BindParam(1)));
      expect(mustBeLike(compile(query))).toBe(
        mustBeLike(`"users"."name" = $1 AND "users"."id" = $2`),
      );
    });
  });

  describe("Nodes::Cube", () => {
    it("should know how to visit with array arguments", () => {
      const node = new Nodes.Cube([table.get("name"), table.get("bool")]);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`CUBE( "users"."name", "users"."bool" )`));
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const dimensions = new Nodes.GroupingElement([table.get("name"), table.get("bool")]);
      const node = new Nodes.Cube(dimensions);
      expect(mustBeLike(compile(node))).toBe(mustBeLike(`CUBE( "users"."name", "users"."bool" )`));
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const dim1 = new Nodes.GroupingElement(table.get("name"));
      const dim2 = new Nodes.GroupingElement([table.get("bool"), table.get("created_at")]);
      const node = new Nodes.Cube([dim1, dim2]);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`CUBE( ( "users"."name" ), ( "users"."bool", "users"."created_at" ) )`),
      );
    });
  });

  describe("Nodes::GroupingSet", () => {
    it("should know how to visit with array arguments", () => {
      const node = new Nodes.GroupingSet([table.get("name"), table.get("bool")]);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`GROUPING SETS( "users"."name", "users"."bool" )`),
      );
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const group = new Nodes.GroupingElement([table.get("name"), table.get("bool")]);
      const node = new Nodes.GroupingSet(group);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`GROUPING SETS( "users"."name", "users"."bool" )`),
      );
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const group1 = new Nodes.GroupingElement(table.get("name"));
      const group2 = new Nodes.GroupingElement([table.get("bool"), table.get("created_at")]);
      const node = new Nodes.GroupingSet([group1, group2]);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`GROUPING SETS( ( "users"."name" ), ( "users"."bool", "users"."created_at" ) )`),
      );
    });
  });

  describe("Nodes::RollUp", () => {
    it("should know how to visit with array arguments", () => {
      const node = new Nodes.RollUp([table.get("name"), table.get("bool")]);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`ROLLUP( "users"."name", "users"."bool" )`),
      );
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const group = new Nodes.GroupingElement([table.get("name"), table.get("bool")]);
      const node = new Nodes.RollUp(group);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`ROLLUP( "users"."name", "users"."bool" )`),
      );
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const group1 = new Nodes.GroupingElement(table.get("name"));
      const group2 = new Nodes.GroupingElement([table.get("bool"), table.get("created_at")]);
      const node = new Nodes.RollUp([group1, group2]);
      expect(mustBeLike(compile(node))).toBe(
        mustBeLike(`ROLLUP( ( "users"."name" ), ( "users"."bool", "users"."created_at" ) )`),
      );
    });
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should construct a valid generic SQL statement", () => {
      const test = new Table("users").get("name").isNotDistinctFrom("Aaron Patterson");
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."name" IS NOT DISTINCT FROM 'Aaron Patterson'`),
      );
    });

    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isNotDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS NOT DISTINCT FROM "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const usersTable = new Table("users");
      const val = buildQuoted(null, usersTable.get("active"));
      const compiled = compile(new Nodes.IsNotDistinctFrom(usersTable.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS NOT DISTINCT FROM NULL`));
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const test = new Table("users")
        .get("first_name")
        .isDistinctFrom(new Table("users").get("last_name"));
      expect(mustBeLike(compile(test))).toBe(
        mustBeLike(`"users"."first_name" IS DISTINCT FROM "users"."last_name"`),
      );
    });

    it("should handle nil", () => {
      const usersTable = new Table("users");
      const val = buildQuoted(null, usersTable.get("active"));
      const compiled = compile(new Nodes.IsDistinctFrom(usersTable.get("name"), val));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"users"."name" IS DISTINCT FROM NULL`));
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle Contains", () => {
      const inner = buildQuoted('{"foo":"bar"}');
      const outer = new Table("products").get("metadata");
      const compiled = compile(new Nodes.Contains(outer, inner));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"products"."metadata" @> '{"foo":"bar"}'`));
    });

    it("should handle Overlaps", () => {
      const column = new Table("products").get("tags");
      const search = buildQuoted("{foo,bar,baz}");
      const compiled = compile(new Nodes.Overlaps(column, search));
      expect(mustBeLike(compiled)).toBe(mustBeLike(`"products"."tags" && '{foo,bar,baz}'`));
    });
  });
});
