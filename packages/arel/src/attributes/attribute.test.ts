import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { testConnection } from "../test-helpers/connection.js";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("AttributeTest", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql(testConnection);
  describe("#not_eq", () => {
    it("should create a NotEqual node", () => {
      expect(users.project(star).where(users.get("id").notEq(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."id" != 10',
      );
    });

    it("should generate != in sql", () => {
      const result = users.project(star).where(users.get("id").notEq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."id" != 10');
    });

    it("should handle nil", () => {
      const relation = new Table("users");
      const node = relation.get("id").notEq(null);
      expect(new Visitors.ToSql(testConnection).compile(node)).toContain("IS NOT NULL");
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").eqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").eqAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 AND "users"."id" = 2)',
      );
    });

    it("should not eat input", () => {
      const relation = new Table("users");
      const values = [1, 2];
      relation.get("id").eqAll(values);
      expect(values).toEqual([1, 2]);
    });
  });

  describe("#gt_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").gtAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").gtAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" > 1 AND "users"."id" > 2)',
      );
    });
  });

  describe("#gt", () => {
    it("should create a GreaterThan node", () => {
      expect(users.get("age").gt(10)).toBeInstanceOf(Nodes.GreaterThan);
      expect(users.project(star).where(users.get("age").gt(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" > 10',
      );
    });

    it("should generate > in sql", () => {
      expect(users.project(star).where(users.get("age").gt(21)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" > 21',
      );
    });

    it("should handle comparing with a subquery", () => {
      const subquery = users.project(users.get("id").maximum());
      const node = users.get("age").gt(subquery);
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").gt("fake_name"));
      expect(mgr.toSql()).toContain("fake_name");
    });
  });

  describe("#gteq_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").gteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").gteqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" >= 1 OR "users"."id" >= 2)',
      );
    });
  });

  describe("#gteq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").gteqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").gteqAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" >= 1 AND "users"."id" >= 2)',
      );
    });
  });

  describe("#gteq", () => {
    it("should create a GreaterThanOrEqual node", () => {
      const node = users.get("age").gteq(10);
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("should generate >= in sql", () => {
      const result = users.project(star).where(users.get("age").gteq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" >= 10');
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").gteq("fake_name"));
      expect(mgr.toSql()).toContain("fake_name");
    });
  });

  describe("#lt_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").ltAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").ltAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" < 1 OR "users"."id" < 2)',
      );
    });
  });

  describe("#lt_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").ltAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").ltAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" < 1 AND "users"."id" < 2)',
      );
    });
  });

  describe("#lt", () => {
    it("should create a LessThan node", () => {
      expect(users.get("age").lt(10)).toBeInstanceOf(Nodes.LessThan);
      expect(users.project(star).where(users.get("age").lt(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" < 10',
      );
    });

    it("should generate < in sql", () => {
      const result = users.project(star).where(users.get("age").lt(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" < 10');
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").lt("fake_name"));
      expect(mgr.toSql()).toContain("fake_name");
    });
  });

  describe("#lteq_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").lteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").lteqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" <= 1 OR "users"."id" <= 2)',
      );
    });
  });

  describe("#lteq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").lteqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").lteqAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" <= 1 AND "users"."id" <= 2)',
      );
    });
  });

  describe("#lteq", () => {
    it("should create a LessThanOrEqual node", () => {
      const node = users.get("age").lteq(10);
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("should generate <= in sql", () => {
      const result = users.project(star).where(users.get("age").lteq(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" <= 10');
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").lteq("fake_name"));
      expect(mgr.toSql()).toContain(`"users"."name" <= 'fake_name'`);

      // Rails compares against Time.now; a fixed value keeps the assertion
      // deterministic. Instant is the Time analogue and reaches FakeRecord's
      // `else` arm, which renders Ruby's `Time#to_s` shape.
      const currentTime = Temporal.Instant.from("2024-01-01T00:00:00Z");
      mgr.where(relation.get("created_at").lteq(currentTime));
      expect(mgr.toSql()).toContain(`"users"."created_at" <= '2024-01-01 00:00:00 +0000'`);
    });
  });

  describe("#eq_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").eqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").eqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 OR "users"."id" = 2)',
      );
    });

    it("should not eat input", () => {
      const relation = new Table("users");
      const values = [1, 2];
      relation.get("id").eqAny(values);
      expect(values).toEqual([1, 2]);
    });
  });

  describe("#average", () => {
    it("should create a AVG node", () => {
      const node = users.get("age").average();
      expect(node).toBeInstanceOf(Nodes.Avg);
    });

    it("should generate the proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").average());
      expect(mgr.toSql()).toContain("AVG");
    });
  });

  describe("#maximum", () => {
    it("should create a MAX node", () => {
      const node = users.get("age").maximum();
      expect(node).toBeInstanceOf(Nodes.Max);
    });

    it("should generate proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").maximum());
      expect(mgr.toSql()).toContain("MAX");
    });
  });

  describe("#minimum", () => {
    it("should create a Min node", () => {
      const node = users.get("age").minimum();
      expect(node).toBeInstanceOf(Nodes.Min);
    });

    it("should generate proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").minimum());
      expect(mgr.toSql()).toContain("MIN");
    });
  });

  describe("#sum", () => {
    it("should create a SUM node", () => {
      const node = users.get("age").sum();
      expect(node).toBeInstanceOf(Nodes.Sum);
    });

    it("should generate the proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").sum());
      expect(mgr.toSql()).toContain("SUM");
    });
  });

  describe("#count", () => {
    it("should return a count node", () => {
      const node = users.get("id").count();
      expect(node).toBeInstanceOf(Nodes.Count);
    });

    it("should take a distinct param", () => {
      expect(users.project(users.get("name").count(true)).toSql()).toBe(
        'SELECT COUNT(DISTINCT "users"."name") FROM "users"',
      );
    });
  });

  describe("#eq", () => {
    it("should return an equality node", () => {
      expect(users.get("id").eq(10)).toBeInstanceOf(Nodes.Equality);
      expect(users.project(star).where(users.get("id").eq(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."id" = 10',
      );
    });

    it("should generate = in sql", () => {
      expect(users.project(star).where(users.get("id").eq(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."id" = 10',
      );
    });

    it("should handle nil", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });
  });

  describe("#matches_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").matchesAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").matchesAny(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%foo%' OR "users"."name" LIKE '%bar%')`,
      );
    });
  });

  describe("#matches_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").matchesAll(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").matchesAll(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%foo%' AND "users"."name" LIKE '%bar%')`,
      );
    });
  });

  describe("#matches", () => {
    it("should create a Matches node", () => {
      expect(users.get("name").matches("%bacon%")).toBeInstanceOf(Nodes.Matches);
      expect(users.project(star).where(users.get("name").matches("%bacon%")).toSql()).toBe(
        `SELECT * FROM "users" WHERE "users"."name" LIKE '%bacon%'`,
      );
    });

    it("should generate LIKE in sql", () => {
      expect(users.project(star).where(users.get("name").matches("%bacon%")).toSql()).toBe(
        `SELECT * FROM "users" WHERE "users"."name" LIKE '%bacon%'`,
      );
    });
  });

  describe("#does_not_match_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").doesNotMatchAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").doesNotMatchAny(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%foo%' OR "users"."name" NOT LIKE '%bar%')`,
      );
    });
  });

  describe("#does_not_match_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").doesNotMatchAll(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").doesNotMatchAll(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%foo%' AND "users"."name" NOT LIKE '%bar%')`,
      );
    });
  });

  describe("#does_not_match", () => {
    it("should create a DoesNotMatch node", () => {
      expect(users.get("name").doesNotMatch("%bacon%")).toBeInstanceOf(Nodes.DoesNotMatch);
      expect(users.project(star).where(users.get("name").doesNotMatch("%bacon%")).toSql()).toBe(
        `SELECT * FROM "users" WHERE "users"."name" NOT LIKE '%bacon%'`,
      );
    });

    it("should generate NOT LIKE in sql", () => {
      expect(users.project(star).where(users.get("name").doesNotMatch("%bacon%")).toSql()).toBe(
        `SELECT * FROM "users" WHERE "users"."name" NOT LIKE '%bacon%'`,
      );
    });
  });

  describe("#in_any", () => {
    it("should create a Grouping node", () => {
      expect(
        users.get("id").inAny([
          [1, 2],
          [3, 4],
        ]),
      ).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(
        users.get("id").inAny([
          [1, 2],
          [3, 4],
        ]),
      );
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" IN (1, 2) OR "users"."id" IN (3, 4))',
      );
    });
  });

  describe("#in_all", () => {
    it("should create a Grouping node", () => {
      expect(
        users.get("id").inAll([
          [1, 2],
          [3, 4],
        ]),
      ).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(
        users.get("id").inAll([
          [1, 2],
          [3, 4],
        ]),
      );
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" IN (1, 2) AND "users"."id" IN (3, 4))',
      );
    });
  });

  describe("#between", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("id").between([1, 3]);
      expect(node).toBeInstanceOf(Nodes.Between);
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("id").between([-Infinity, 3]);
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const node = users.get("id").between({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const node = users.get("id").between({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const node = users.get("id").between({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("can be constructed with an infinite range", () => {
      const node = users.get("id").between([-Infinity, Infinity]);
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("can be constructed with a quoted infinite range", () => {
      const node = users.get("id").between({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("can be constructed with a range ending at Infinity", () => {
      const node = users.get("id").between([1, Infinity]);
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("id").between({ begin: null, end: 3 });
      expect(node).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("id").between({ begin: 1, end: null });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with an exclusive range implicitly ending at Infinity", () => {
      const node = users.get("id").between({ begin: 1, end: null, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("id").between({ begin: 1, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("id").between({ begin: Infinity, end: null });
      expect(node).toBeInstanceOf(Nodes.In);
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("id").between({ begin: null, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("id").between({ begin: 1, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.And);
    });

    it("can be constructed with a range where the begin and end are equal", () => {
      const node = users.get("id").between([5, 5]);
      expect(node).toBeInstanceOf(Nodes.Equality);
    });
  });

  describe("#not_between", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("age").notBetween([18, 65]);
      expect(node).toBeInstanceOf(Nodes.Grouping);
      expect((node as Nodes.Grouping).expr).toBeInstanceOf(Nodes.Or);
      expect(visitor.compile(node)).toBe('("users"."age" < 18 OR "users"."age" > 65)');
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").notBetween([-Infinity, 65]);
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
      expect(visitor.compile(node)).toBe('"users"."age" > 65');
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const node = users.get("id").notBetween({ begin: -Infinity, end: 3 });
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const node = users.get("id").notBetween({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const node = users.get("id").notBetween({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("can be constructed with an infinite range", () => {
      const node = users.get("id").notBetween([-Infinity, Infinity]);
      expect(node).toBeInstanceOf(Nodes.In);
    });

    it("can be constructed with a quoted infinite range", () => {
      const node = users.get("id").notBetween({ begin: -Infinity, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.In);
    });

    it("can be constructed with a range ending at Infinity", () => {
      const node = users.get("id").notBetween([1, Infinity]);
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("age").notBetween({ begin: null, end: 0 });
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("age").notBetween({ begin: 0, end: null });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("age").notBetween({ begin: 18, end: Infinity });
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("age").notBetween({ begin: Infinity, end: null });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("age").notBetween({ begin: null, end: -Infinity });
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("age").notBetween({ begin: 18, end: 65, excludeEnd: true });
      expect(node).toBeInstanceOf(Nodes.Grouping);
      const inner = (node as Nodes.Grouping).expr as Nodes.Or;
      expect(inner.children[1]).toBeInstanceOf(Nodes.GreaterThanOrEqual);
      expect(visitor.compile(node)).toBe('("users"."age" < 18 OR "users"."age" >= 65)');
    });
  });

  describe("#not_in", () => {
    it("can be constructed with a subquery", () => {
      const mgr = users.project(users.get("id"));
      const node = users.get("id").notIn(mgr);
      expect(node).toBeInstanceOf(Nodes.NotIn);
    });

    it("can be constructed with a Union", () => {
      const mgr1 = users.project(users.get("id"));
      const mgr2 = users.project(users.get("id"));
      const union = mgr1.union(mgr2);
      expect(union).toBeInstanceOf(Nodes.Union);
      const node = users.get("id").in(union);
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IN (');
      expect(sql).toContain(
        'SELECT "users"."id" FROM "users" UNION SELECT "users"."id" FROM "users"',
      );
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      expect(node).toBeInstanceOf(Nodes.NotIn);
      expect(visitor.compile(node)).toBe('"users"."id" NOT IN (1, 2, 3)');
    });

    it("can be constructed with a random object", () => {
      const attribute = users.get("id");
      const randomObject = {};
      const node = attribute.notIn(randomObject);

      expect(node).toEqual(new Nodes.NotIn(attribute, new Nodes.Casted(randomObject, attribute)));
    });

    it("should generate NOT IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").notIn([1, 2, 3]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE "users"."id" NOT IN (1, 2, 3)',
      );
    });
  });

  describe("#in", () => {
    it("should generate IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").in([1, 2, 3]));
      expect(mgr.toSql()).toBe('SELECT "users"."id" FROM "users" WHERE "users"."id" IN (1, 2, 3)');
    });

    it("can be constructed with a subquery", () => {
      const mgr = users.project(users.get("id"));
      const attribute = users.get("id");
      const node = attribute.in(mgr);

      expect(node).toEqual(new Nodes.In(attribute, mgr.ast));
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").in([1, 2, 3]);
      expect(node).toBeInstanceOf(Nodes.In);
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("can be constructed with a random object", () => {
      const attribute = users.get("id");
      const randomObject = {};
      const node = attribute.in(randomObject);

      expect(node).toEqual(new Nodes.In(attribute, new Nodes.Casted(randomObject, attribute)));
    });
  });

  describe("#not_in_any", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").notInAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(
        users.get("id").notInAny([
          [1, 2],
          [3, 4],
        ]),
      );
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" NOT IN (1, 2) OR "users"."id" NOT IN (3, 4))',
      );
    });
  });

  describe("#not_in_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").notInAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(
        users.get("id").notInAll([
          [1, 2],
          [3, 4],
        ]),
      );
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" NOT IN (1, 2) AND "users"."id" NOT IN (3, 4))',
      );
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").eqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").eqAll([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 AND "users"."id" = 2)',
      );
    });
  });

  describe("#asc", () => {
    it("should create an Ascending node", () => {
      const node = users.get("name").asc();
      expect(node).toBeInstanceOf(Nodes.Ascending);
    });

    it("should generate ASC in sql", () => {
      expect(users.project(star).order(users.get("name").asc()).toSql()).toBe(
        'SELECT * FROM "users" ORDER BY "users"."name" ASC',
      );
    });
  });

  describe("#desc", () => {
    it("should create a Descending node", () => {
      const node = users.get("name").desc();
      expect(node).toBeInstanceOf(Nodes.Descending);
    });

    it("should generate DESC in sql", () => {
      expect(users.project(star).order(users.get("name").desc()).toSql()).toBe(
        'SELECT * FROM "users" ORDER BY "users"."name" DESC',
      );
    });
  });

  describe("#contains", () => {
    it("should create a Contains node", () => {
      const node = users.get("tags").contains("foo");
      expect(node).toBeInstanceOf(Nodes.InfixOperation);
    });

    it("should generate @> in sql", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe('"users"."tags" @> \'foo\'');
    });
  });

  describe("#overlaps", () => {
    it("should create an Overlaps node", () => {
      const node = users.get("tags").overlaps("bar");
      expect(node).toBeInstanceOf(Nodes.Overlaps);
    });

    it("should generate && in sql", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = users.get("tags").overlaps("bar");
      expect(visitor.compile(node)).toBe('"users"."tags" && \'bar\'');
    });
  });

  describe("equality", () => {
    it("should produce sql", () => {
      const visitor = new Visitors.ToSql(testConnection);
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe('"users"."tags" @> \'foo\'');
    });

    describe("#to_sql", () => {
      it("should produce sql", () => {
        const relation = new Table("users");
        const node = relation.get("id").eq(10);
        const visitor = new Visitors.ToSql(testConnection);
        expect(visitor.compile(node)).toContain('"users"."id" = 10');
      });
    });
  });

  describe("type casting", () => {
    it("does not type cast by default", () => {
      const table = new Table("foo");
      const condition = table.get("id").eq("1");

      expect(table.isAbleToTypeCast()).toBe(false);
      expect(new Visitors.ToSql(testConnection).compile(condition)).toBe('"foo"."id" = \'1\'');
    });

    it("type casts when given an explicit caster", () => {
      const fakeCaster = {
        typeCastForDatabase(attrName: string, value: unknown) {
          return attrName === "id" ? Number(value) : value;
        },
      };
      const table = new Table("foo", { typeCaster: fakeCaster });
      const condition = table.get("id").eq("1").and(table.get("other_id").eq("2"));

      expect(table.isAbleToTypeCast()).toBe(true);
      expect(new Visitors.ToSql(testConnection).compile(condition)).toBe(
        '"foo"."id" = 1 AND "foo"."other_id" = \'2\'',
      );
    });

    it("does not type cast SqlLiteral nodes", () => {
      const fakeCaster = {
        typeCastForDatabase(_attrName: string, value: unknown) {
          return Number(value);
        },
      };
      const table = new Table("foo", { typeCaster: fakeCaster });
      const condition = table.get("id").eq(new Nodes.SqlLiteral("(select 1)"));

      expect(table.isAbleToTypeCast()).toBe(true);
      expect(new Visitors.ToSql(testConnection).compile(condition)).toBe('"foo"."id" = (select 1)');
    });

    it("type casts IN list elements through the attribute", () => {
      const fakeCaster = {
        typeCastForDatabase(attrName: string, value: unknown) {
          return attrName === "id" ? Number(value) : value;
        },
      };
      const table = new Table("foo", { typeCaster: fakeCaster });
      const condition = table.get("id").in(["1", "2"]);

      expect(new Visitors.ToSql(testConnection).compile(condition)).toBe('"foo"."id" IN (1, 2)');
    });

    it("type casts NOT IN list elements through the attribute", () => {
      const fakeCaster = {
        typeCastForDatabase(attrName: string, value: unknown) {
          return attrName === "id" ? Number(value) : value;
        },
      };
      const table = new Table("foo", { typeCaster: fakeCaster });
      const condition = table.get("id").notIn(["1", "2"]);

      expect(new Visitors.ToSql(testConnection).compile(condition)).toBe(
        '"foo"."id" NOT IN (1, 2)',
      );
    });

    it("builds Casted nodes so a null in an IN list casts through the column", () => {
      const fakeCaster = {
        typeCastForDatabase(_attrName: string, value: unknown) {
          return value === null ? 0 : value;
        },
      };
      const table = new Table("foo", { typeCaster: fakeCaster });
      const attr = table.get("id");
      const node = attr.in([null]);
      const right = (node.right as unknown as Nodes.Node[])[0];

      expect(right).toBeInstanceOf(Nodes.Casted);
      expect((right as Nodes.Casted).attribute).toBe(attr);
      expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"foo"."id" IN (0)');
    });
  });

  describe("#gt_any", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("id").gtAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").gtAny([1, 2]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."id" > 1 OR "users"."id" > 2)`,
      );
    });
  });

  describe("#not_eq_all", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("id").notEqAll([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").notEqAll([1, 2]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."id" != 1 AND "users"."id" != 2)`,
      );
    });
  });

  describe("#not_eq_any", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("id").notEqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ORs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").notEqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."id" != 1 OR "users"."id" != 2)`,
      );
    });
  });
});
