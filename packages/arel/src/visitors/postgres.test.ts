import { describe, it, expect } from "vitest";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("PostgresTest", () => {
  const users = new Table("users");
  describe("Nodes::NotRegexp", () => {
    it("should know how to visit", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").in([1, 2, 3]);
      expect(visitor.compile(node)).toContain("IN");
    });

    it("can handle case insensitive", () => {
      const node = users.get("name").doesNotMatchRegexp("foo.*", false);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("!~*");
    });

    it("can handle subqueries", () => {
      const mgr = users
        .project(users.get("id"))
        .where(users.get("name").doesNotMatchRegexp("foo.*"));
      const node = users.get("id").in(mgr);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("!~");
    });
  });

  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").isDistinctFrom(null);
      expect(visitor.compile(node)).toContain("IS DISTINCT FROM");
    });

    it("should handle column names on both sides", () => {
      const node = users.get("name").isDistinctFrom(users.get("login"));
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::DoesNotMatch", () => {
    it("can handle ESCAPE", () => {
      const node = users.get("name").doesNotMatch("foo%", "\\", true);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("NOT LIKE");
    });

    it("should know how to visit", () => {
      const node = users.get("name").doesNotMatch("foo%");
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("NOT ILIKE");
    });

    it("should know how to visit case sensitive", () => {
      const node = users.get("name").doesNotMatch("foo%", null, true);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("NOT LIKE");
      expect(sql).not.toContain("ILIKE");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("id")).where(users.get("name").doesNotMatch("foo%"));
      const node = users.get("id").in(mgr);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("NOT ILIKE");
    });
  });

  describe("locking", () => {
    it("defaults to FOR UPDATE", () => {
      const mgr = users.project(star).lock();
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("FOR UPDATE");
    });

    it("allows a custom string to be used as a lock", () => {
      const mgr = users.project(star).lock("FOR SHARE");
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("FOR SHARE");
    });
  });

  it("should support DISTINCT ON", () => {
    const mgr = new SelectManager(users).project(star).distinctOn(users.get("id"));
    const sql = new Visitors.PostgreSQL().compile(mgr.ast);
    expect(sql).toContain("DISTINCT ON");
  });

  it("should support DISTINCT", () => {
    const mgr = new SelectManager(users).project(star).distinct();
    const sql = new Visitors.PostgreSQL().compile(mgr.ast);
    expect(sql).toContain("SELECT DISTINCT");
  });

  it("encloses LATERAL queries in parens", () => {
    const sub = users.project(users.get("id"));
    const lat = sub.lateral();
    const sql = new Visitors.PostgreSQL().compile(lat);
    expect(sql).toContain("LATERAL (");
    expect(sql).toContain(")");
  });

  it("produces LATERAL queries with alias", () => {
    const sub = users.project(users.get("id"));
    const lat = sub.lateral("t");
    const sql = new Visitors.PostgreSQL().compile(lat);
    expect(sql).toContain("LATERAL (");
    expect(sql).toContain('"t"');
  });

  describe("Nodes::BindParam", () => {
    it("increments each bind param", () => {
      const visitor = new Visitors.PostgreSQLWithBinds();
      const a = users.get("id").eq(new Nodes.BindParam());
      const b = users.get("name").eq(new Nodes.BindParam());
      const sql = visitor.compile(new Nodes.And([a, b]));
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
    });

    it("compileWithBinds extracts values with $N placeholders", () => {
      const visitor = new Visitors.PostgreSQLWithBinds();
      const a = users.get("id").eq(new Nodes.BindParam(42));
      const b = users.get("name").eq(new Nodes.BindParam("alice"));
      const [sql, binds] = visitor.compileWithBinds(new Nodes.And([a, b]));
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
      expect(sql).not.toContain("42");
      expect(sql).not.toContain("alice");
      expect(binds).toEqual([42, "alice"]);
    });
  });

  describe("Nodes::RollUp", () => {
    it("should know how to visit with array arguments", () => {
      const node = users.get("id").in([1, 2, 3]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IN (1, 2, 3)");
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const mgr = users.project(star).group(new Nodes.Cube([users.get("id")]));
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain("CUBE(");
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const mgr = users.project(star).group(new Nodes.Cube([users.get("id"), users.get("name")]));
      const sql = new Visitors.PostgreSQL().compile(mgr.ast);
      expect(sql).toContain('CUBE("users"."id", "users"."name")');
    });

    it("should know how to visit with array arguments", () => {
      const node = new Nodes.Rollup([users.get("name"), users.get("bool")]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ROLLUP");
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const dim = new Nodes.GroupingElement([users.get("name")]);
      const node = new Nodes.Rollup([dim]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ROLLUP");
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const d1 = new Nodes.GroupingElement([users.get("name")]);
      const d2 = new Nodes.GroupingElement([users.get("bool")]);
      const node = new Nodes.Rollup([d1, d2]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ROLLUP");
      expect(sql).toContain("(");
    });
  });

  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });

    it("should handle column names on both sides", () => {
      const node = users.get("name").isNotDistinctFrom(users.get("login"));
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("IS NOT DISTINCT FROM");
    });
  });

  describe("Nodes::InfixOperation", () => {
    it("should handle Contains", () => {
      const visitor = new Visitors.ToSql();
      const products = new Table("products");
      const node = products.get("metadata").contains('{"foo":"bar"}');
      expect(visitor.compile(node)).toBe(`"products"."metadata" @> '{"foo":"bar"}'`);
    });

    it("should handle Overlaps", () => {
      const visitor = new Visitors.ToSql();
      const products = new Table("products");
      const node = products.get("tags").overlaps("{foo,bar,baz}");
      expect(visitor.compile(node)).toBe(`"products"."tags" && '{foo,bar,baz}'`);
    });
  });

  describe("Nodes::GroupingSet", () => {
    it("should know how to visit with array arguments", () => {
      const node = new Nodes.GroupingSet([users.get("name"), users.get("bool")]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("GROUPING SETS");
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const dim = new Nodes.GroupingElement([users.get("name"), users.get("bool")]);
      const node = new Nodes.GroupingSet([dim]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("GROUPING SETS");
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const d1 = new Nodes.GroupingElement([users.get("name")]);
      const d2 = new Nodes.GroupingElement([users.get("bool")]);
      const node = new Nodes.GroupingSet([d1, d2]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("GROUPING SETS");
      expect(sql).toContain("(");
    });
  });

  describe("Nodes::Cube", () => {
    it("should know how to visit with array arguments", () => {
      const node = new Nodes.Cube([users.get("name"), users.get("bool")]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("CUBE");
    });

    it("should know how to visit with CubeDimension Argument", () => {
      const dim = new Nodes.GroupingElement([users.get("name"), users.get("bool")]);
      const node = new Nodes.Cube([dim]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("CUBE");
    });

    it("should know how to generate parenthesis when supplied with many Dimensions", () => {
      const d1 = new Nodes.GroupingElement([users.get("name")]);
      const d2 = new Nodes.GroupingElement([users.get("bool"), users.get("created_at")]);
      const node = new Nodes.Cube([d1, d2]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("CUBE");
      expect(sql).toContain("(");
    });
  });

  describe("Nodes::Regexp", () => {
    it("should know how to visit", () => {
      const node = users.get("name").matchesRegexp("foo.*");
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("~");
      expect(sql).toContain("foo.*");
    });

    it("can handle case insensitive", () => {
      const node = users.get("name").matchesRegexp("foo.*", false);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("~*");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("id")).where(users.get("name").matchesRegexp("foo.*"));
      const node = users.get("id").in(mgr);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("SELECT");
      expect(sql).toContain("~");
    });
  });

  describe("Nodes::Matches", () => {
    it("should know how to visit", () => {
      const node = users.get("name").matches("foo%");
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ILIKE");
    });

    it("should know how to visit case sensitive", () => {
      const node = users.get("name").matches("foo%", null, true);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("LIKE");
      expect(sql).not.toContain("ILIKE");
    });

    it("can handle ESCAPE", () => {
      const node = users.get("name").matches("foo!%", "!");
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ILIKE");
      expect(sql).toContain("ESCAPE");
    });

    it("can handle subqueries", () => {
      const mgr = users.project(users.get("id")).where(users.get("name").matches("foo%"));
      const node = users.get("id").in(mgr);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("ILIKE");
    });
  });

  describe("array quoting", () => {
    it("quotes array values as PG array literals", () => {
      const node = users.get("tags").eq(["a", "b"]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain('\'{"a","b"}\'');
    });

    it("quotes nested arrays", () => {
      const node = users.get("tags").eq([
        [1, 2],
        [3, 4],
      ]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("'{{1,2},{3,4}}'");
    });

    it("escapes single quotes in array elements", () => {
      const node = users.get("tags").eq(["O'Reilly"]);
      const sql = new Visitors.PostgreSQL().compile(node);
      expect(sql).toContain("'{\"O''Reilly\"}'");
    });
  });
});
