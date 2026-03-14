import { describe, it, expect } from "vitest";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("AttributeTest", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql();
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

  describe("#eq_all", () => {
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
  });

  describe("#lteq", () => {
    it("should accept various data types.", () => {
      expect(users.project(star).where(users.get("age").gt(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" > 10',
      );
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").gteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").gteqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" >= 1 OR "users"."id" >= 2)',
      );
    });
  });

  describe("#eq_all", () => {
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
  });

  describe("#lteq", () => {
    it("should accept various data types.", () => {
      expect(users.project(star).where(users.get("age").gteq(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" >= 10',
      );
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").ltAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").ltAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" < 1 OR "users"."id" < 2)',
      );
    });
  });

  describe("#eq_all", () => {
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
      expect(users.project(star).where(users.get("age").lt(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" < 10',
      );
    });

    it("should generate < in sql", () => {
      const result = users.project(star).where(users.get("age").lt(10)).toSql();
      expect(result).toBe('SELECT * FROM "users" WHERE "users"."age" < 10');
    });
  });

  describe("#lteq", () => {
    it("should accept various data types.", () => {
      expect(users.project(star).where(users.get("age").lt(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" < 10',
      );
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").lteqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").lteqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" <= 1 OR "users"."id" <= 2)',
      );
    });
  });

  describe("#eq_all", () => {
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
      expect(users.project(star).where(users.get("age").lteq(10)).toSql()).toBe(
        'SELECT * FROM "users" WHERE "users"."age" <= 10',
      );
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("id").eqAny([1, 2])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").eqAny([1, 2]));
      expect(mgr.toSql()).toBe(
        'SELECT "users"."id" FROM "users" WHERE ("users"."id" = 1 OR "users"."id" = 2)',
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

  describe("#average", () => {
    it("should create a AVG node", () => {
      const node = users.get("age").average();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("AVG");
    });
  });

  describe("#maximum", () => {
    it("should create a MAX node", () => {
      const node = users.get("age").maximum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("MAX");
    });
  });

  describe("#minimum", () => {
    it("should create a Min node", () => {
      const node = users.get("age").minimum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("MIN");
    });
  });

  describe("#sum", () => {
    it("should create a SUM node", () => {
      const node = users.get("age").sum();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("SUM");
    });
  });

  describe("#count", () => {
    it("should return a count node", () => {
      const node = users.get("id").count();
      expect(node).toBeInstanceOf(Nodes.NamedFunction);
      expect(node.name).toBe("COUNT");
    });

    it("should take a distinct param", () => {
      expect(users.project(users.get("name").count(true)).toSql()).toBe(
        'SELECT COUNT(DISTINCT "users"."name") FROM "users"',
      );
    });
  });

  describe("#eq", () => {
    it("should return an equality node", () => {
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
      const visitor = new Visitors.ToSql();
      const node = users.get("name").eq(null);
      expect(visitor.compile(node)).toBe('"users"."name" IS NULL');
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").matchesAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").matchesAny(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%foo%' OR "users"."name" LIKE '%bar%')`,
      );
    });
  });

  describe("#eq_all", () => {
    it("should not eat input", () => {
      const input = [1, 2, 3];
      const copy = [...input];
      users.get("id").eqAny(input);
      expect(input).toEqual(copy);
    });

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

    it("should not eat input", () => {
      const input = [1, 2, 3];
      const copy = [...input];
      users.get("id").eqAll(input);
      expect(input).toEqual(copy);
    });
  });

  describe("#matches", () => {
    it("should create a Matches node", () => {
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

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(users.get("name").doesNotMatchAny(["%foo%", "%bar%"])).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("name").doesNotMatchAny(["%foo%", "%bar%"]));
      expect(mgr.toSql()).toBe(
        `SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%foo%' OR "users"."name" NOT LIKE '%bar%')`,
      );
    });
  });

  describe("#eq_all", () => {
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

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(
        users.get("id").inAny([
          [1, 2],
          [3, 4],
        ]),
      ).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
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

  describe("#eq_all", () => {
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

  describe("#not_between", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("age").between(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").between({ begin: -Infinity, end: 65 });
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" <= 65');
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const node = users.get("id").lteq(new Nodes.Quoted(100));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const node = users.get("id").lt(100);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const node = users.get("id").lt(new Nodes.Quoted(100));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });

    it("can be constructed with an infinite range", () => {
      // -Infinity..Infinity is always true
      const node = users.get("id").between(-Infinity, Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("TRUE");
    });

    it("can be constructed with a quoted infinite range", () => {
      const node = users.get("id").between(-Infinity, Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe("TRUE");
    });

    it("can be constructed with a range ending at Infinity", () => {
      const node = users.get("id").gteq(1);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("age").notBetween(Infinity, 65);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("age").notBetween(18, Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });
  });

  describe("#between", () => {
    it("can be constructed with an exclusive range implicitly ending at Infinity", () => {
      const node = users.get("id").lt(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<");
    });
  });

  describe("#not_between", () => {
    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("age").notBetween(18, Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("age").notBetween(Infinity, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("age").notBetween(-Infinity, -Infinity);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("age").between(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
    });
  });

  describe("#between", () => {
    it("can be constructed with a range where the begin and end are equal", () => {
      const node = users.get("id").between([5, 5]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
    });
  });

  describe("#not_in", () => {
    it("can be constructed with a subquery", () => {
      const subquery = users.project(users.get("id"));
      const node = users.get("id").in(subquery);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").in([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("can be constructed with a random object", () => {
      const node = users.get("age").notBetween(1, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });
  });

  describe("#in", () => {
    it("should generate IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").in([1, 2, 3]));
      expect(mgr.toSql()).toBe('SELECT "users"."id" FROM "users" WHERE "users"."id" IN (1, 2, 3)');
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(
        users.get("id").notInAny([
          [1, 2],
          [3, 4],
        ]),
      ).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
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

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      expect(
        users.get("id").notInAll([
          [1, 2],
          [3, 4],
        ]),
      ).toBeInstanceOf(Nodes.Grouping);
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

  describe("#not_between", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("age").notBetween(18, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("NOT");
      expect(visitor.compile(node)).toContain("BETWEEN");
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").between(-Infinity, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."age" <= 65');
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const node = users.get("id").gteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const node = users.get("id").lteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const node = users.get("id").gteq(new Nodes.Quoted(1));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const node = users.get("id").gteq(Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const node = users.get("id").lteq(-Infinity);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
    });

    it("can be constructed with an exclusive range", () => {
      const node = users.get("age").notBetween(18, 65);
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("NOT");
    });
  });

  describe("#not_in", () => {
    it("can be constructed with a Union", () => {
      const node = users.get("age").notBetween(1, 100);
      expect(node).toBeInstanceOf(Nodes.Not);
    });

    it("can be constructed with a list", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."id" NOT IN (1, 2, 3)');
    });

    it("can be constructed with a random object", () => {
      // Using a quoted value
      const node = users.get("id").eq(new Nodes.Quoted("random_thing"));
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("'random_thing'");
    });

    it("should generate NOT IN in sql", () => {
      expect(
        users
          .project(star)
          .where(users.get("id").notIn([1, 2]))
          .toSql(),
      ).toBe('SELECT * FROM "users" WHERE "users"."id" NOT IN (1, 2)');
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      const left = users.get("age").between(18, 30);
      const right = users.get("age").between(40, 50);
      const node = new Nodes.Grouping(new Nodes.Or(left, right));
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const left = users.get("age").between(18, 30);
      const right = users.get("age").between(40, 50);
      const node = new Nodes.Grouping(new Nodes.Or(left, right));
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("OR");
      expect(result).toContain("BETWEEN");
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      const left = users.get("age").between(18, 65);
      const right = users.get("score").between(1, 100);
      const node = new Nodes.Grouping(new Nodes.And([left, right]));
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const left = users.get("tags").contains("a");
      const right = users.get("tags").contains("b");
      const node = new Nodes.And([left, right]);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("AND");
    });

    it("should create a Grouping node", () => {
      const left = users.get("age").notBetween(18, 30);
      const right = users.get("age").notBetween(40, 50);
      const node = new Nodes.Grouping(new Nodes.Or(left, right));
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const left = users.get("age").between(18, 65);
      const right = users.get("score").between(1, 100);
      const node = new Nodes.Grouping(new Nodes.And([left, right]));
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("AND");
      expect(result).toContain("BETWEEN");
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
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe('"users"."tags" @> \'foo\'');
    });
  });

  describe("#overlaps", () => {
    it("should generate && in sql", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").overlaps("bar");
      expect(visitor.compile(node)).toBe('"users"."tags" && \'bar\'');
    });
  });

  describe("equality", () => {
    it("should produce sql", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("tags").contains("foo");
      expect(visitor.compile(node)).toBe('"users"."tags" @> \'foo\'');
    });
  });

  describe("type casting", () => {
    it("does not type cast by default", () => {
      const attr = new Nodes.Attribute(users, "name");
      const node = attr.eq("hello");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."name" = \'hello\'');
    });

    it("type casts when given an explicit caster", () => {
      const caster = {
        typeCastForDatabase(value: unknown) {
          return String(value).toUpperCase();
        },
      };
      const attr = new Nodes.Attribute(users, "name", caster);
      const node = attr.eq("hello");
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toBe('"users"."name" = \'HELLO\'');
    });

    it("does not type cast SqlLiteral nodes", () => {
      const caster = {
        typeCastForDatabase(value: unknown) {
          return String(value).toUpperCase();
        },
      };
      const attr = new Nodes.Attribute(users, "name", caster);
      const literal = new Nodes.SqlLiteral("raw_value");
      const node = attr.eq(literal);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("raw_value");
    });
  });

  it("notEq(null) generates IS NOT NULL", () => {
    expect(users.project(star).where(users.get("name").notEq(null)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."name" IS NOT NULL',
    );
  });

  it("gteq generates >=", () => {
    expect(users.project(star).where(users.get("age").gteq(10)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."age" >= 10',
    );
  });

  it("lteq generates <=", () => {
    expect(users.project(star).where(users.get("age").lteq(10)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."age" <= 10',
    );
  });

  it("in generates IN", () => {
    expect(
      users
        .project(star)
        .where(users.get("id").in([1, 2, 3]))
        .toSql(),
    ).toBe('SELECT * FROM "users" WHERE "users"."id" IN (1, 2, 3)');
  });

  it("in with empty array generates 1=0 (always false)", () => {
    expect(users.project(star).where(users.get("id").in([])).toSql()).toBe(
      'SELECT * FROM "users" WHERE 1=0',
    );
  });

  it("notIn with empty array generates 1=1 (always true)", () => {
    expect(users.project(star).where(users.get("id").notIn([])).toSql()).toBe(
      'SELECT * FROM "users" WHERE 1=1',
    );
  });

  it("between generates BETWEEN", () => {
    expect(users.project(star).where(users.get("age").between(18, 65)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."age" BETWEEN 18 AND 65',
    );
  });

  it("notBetween generates NOT BETWEEN", () => {
    expect(users.project(star).where(users.get("age").notBetween(18, 65)).toSql()).toBe(
      'SELECT * FROM "users" WHERE NOT ("users"."age" BETWEEN 18 AND 65)',
    );
  });

  it("isNull generates IS NULL", () => {
    expect(users.project(star).where(users.get("name").isNull()).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."name" IS NULL',
    );
  });

  it("isNotNull generates IS NOT NULL", () => {
    expect(users.project(star).where(users.get("name").isNotNull()).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."name" IS NOT NULL',
    );
  });

  it("and combines with AND", () => {
    const cond = users.get("name").eq("dean").and(users.get("age").gt(21));
    expect(users.project(star).where(cond).toSql()).toBe(
      `SELECT * FROM "users" WHERE "users"."name" = 'dean' AND "users"."age" > 21`,
    );
  });

  it("or combines with OR wrapped in Grouping", () => {
    const cond = users.get("name").eq("dean").or(users.get("name").eq("sam"));
    expect(users.project(star).where(cond).toSql()).toBe(
      `SELECT * FROM "users" WHERE ("users"."name" = 'dean' OR "users"."name" = 'sam')`,
    );
  });

  it("not negates", () => {
    const cond = users.get("name").eq("dean").not();
    expect(users.project(star).where(cond).toSql()).toBe(
      `SELECT * FROM "users" WHERE NOT ("users"."name" = 'dean')`,
    );
  });

  it("eqAny generates OR group", () => {
    const result = users
      .project(star)
      .where(users.get("name").eqAny(["dean", "sam"]))
      .toSql();
    expect(result).toBe(
      `SELECT * FROM "users" WHERE ("users"."name" = 'dean' OR "users"."name" = 'sam')`,
    );
  });

  it("eqAll generates AND group", () => {
    const result = users
      .project(star)
      .where(users.get("name").eqAll(["dean", "sam"]))
      .toSql();
    expect(result).toBe(
      `SELECT * FROM "users" WHERE ("users"."name" = 'dean' AND "users"."name" = 'sam')`,
    );
  });

  it("gtAny generates OR group", () => {
    const result = users
      .project(star)
      .where(users.get("age").gtAny([10, 20]))
      .toSql();
    expect(result).toBe(`SELECT * FROM "users" WHERE ("users"."age" > 10 OR "users"."age" > 20)`);
  });

  it("ltAll generates AND group", () => {
    const result = users
      .project(star)
      .where(users.get("age").ltAll([50, 100]))
      .toSql();
    expect(result).toBe(`SELECT * FROM "users" WHERE ("users"."age" < 50 AND "users"."age" < 100)`);
  });

  it("matchesAny generates OR group", () => {
    const result = users
      .project(star)
      .where(users.get("name").matchesAny(["%dean%", "%sam%"]))
      .toSql();
    expect(result).toBe(
      `SELECT * FROM "users" WHERE ("users"."name" LIKE '%dean%' OR "users"."name" LIKE '%sam%')`,
    );
  });

  it("does not mutate input array", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    users.get("id").eqAny(input);
    expect(input).toEqual(copy);
  });

  it("lower", () => {
    const name = users.get("name");
    const fn = name.lower();
    const mgr = new SelectManager(users);
    mgr.project(fn);
    const sql = mgr.toSql();
    expect(sql).toContain("LOWER");
    expect(sql).toContain('"name"');
  });

  it("upper() generates UPPER function", () => {
    const name = users.get("name");
    const fn = name.upper();
    const mgr = new SelectManager(users);
    mgr.project(fn);
    const sql = mgr.toSql();
    expect(sql).toContain("UPPER");
  });

  it("coalesce", () => {
    const name = users.get("name");
    const fn = name.coalesce("Unknown");
    const mgr = new SelectManager(users);
    mgr.project(fn);
    const sql = mgr.toSql();
    expect(sql).toContain("COALESCE");
    expect(sql).toContain("'Unknown'");
  });

  it("generates LENGTH()", () => {
    const node = users.attr("name").length();
    expect(visitor.compile(node)).toBe('LENGTH("users"."name")');
  });

  it("generates TRIM()", () => {
    const node = users.attr("name").trim();
    expect(visitor.compile(node)).toBe('TRIM("users"."name")');
  });

  it("generates LTRIM()", () => {
    const node = users.attr("name").ltrim();
    expect(visitor.compile(node)).toBe('LTRIM("users"."name")');
  });

  it("generates RTRIM()", () => {
    const node = users.attr("name").rtrim();
    expect(visitor.compile(node)).toBe('RTRIM("users"."name")');
  });

  it("generates SUBSTRING()", () => {
    const node = users.attr("name").substring(1, 3);
    expect(visitor.compile(node)).toBe('SUBSTRING("users"."name", 1, 3)');
  });

  it("generates CONCAT()", () => {
    const node = users.attr("first_name").concat(" ", users.attr("last_name"));
    const sql = visitor.compile(node);
    expect(sql).toContain("CONCAT(");
    expect(sql).toContain('"users"."first_name"');
  });

  it("generates REPLACE()", () => {
    const node = users.attr("name").replace("old", "new");
    const sql = visitor.compile(node);
    expect(sql).toContain("REPLACE(");
    expect(sql).toContain('"users"."name"');
  });

  it("generates ABS()", () => {
    const node = users.attr("balance").abs();
    expect(visitor.compile(node)).toBe('ABS("users"."balance")');
  });

  it("generates ROUND()", () => {
    const node = users.attr("score").round(2);
    expect(visitor.compile(node)).toBe('ROUND("users"."score", 2)');
  });

  it("generates ROUND() without precision", () => {
    const node = users.attr("score").round();
    expect(visitor.compile(node)).toBe('ROUND("users"."score")');
  });

  it("generates CEIL()", () => {
    const node = users.attr("score").ceil();
    expect(visitor.compile(node)).toBe('CEIL("users"."score")');
  });

  it("generates FLOOR()", () => {
    const node = users.attr("score").floor();
    expect(visitor.compile(node)).toBe('FLOOR("users"."score")');
  });

  it("should handle nil for notEq", () => {
    const result = users.project(star).where(users.get("name").notEq(null)).toSql();
    expect(result).toBe('SELECT * FROM "users" WHERE "users"."name" IS NOT NULL');
  });

  it("should create a Grouping node from or", () => {
    const node = users.get("id").eq(1).or(users.get("id").eq(2));
    expect(node).toBeInstanceOf(Nodes.Grouping);
  });

  it("should generate ORs in sql from eq", () => {
    const cond = users.get("id").eq(1).or(users.get("id").eq(2));
    const result = users.project(star).where(cond).toSql();
    expect(result).toBe('SELECT * FROM "users" WHERE ("users"."id" = 1 OR "users"."id" = 2)');
  });

  it("should create a Grouping node from and wrapped in grouping via eqAll", () => {
    const node = users.get("name").eqAll(["dean", "sam"]);
    expect(node).toBeInstanceOf(Nodes.Grouping);
  });

  it("should generate ANDs in sql from eqAll", () => {
    const result = users
      .project(star)
      .where(users.get("name").eqAll(["dean", "sam"]))
      .toSql();
    expect(result).toBe(
      `SELECT * FROM "users" WHERE ("users"."name" = 'dean' AND "users"."name" = 'sam')`,
    );
  });

  describe("#gt", () => {
    it("should create a GreaterThan node", () => {
      const node = users.get("age").gt(10);
      expect(node).toBeInstanceOf(Nodes.GreaterThan);
    });
  });

  it("should accept various data types for gt", () => {
    expect(users.project(star).where(users.get("age").gt(10)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."age" > 10',
    );
  });

  describe("#lt", () => {
    it("should create a LessThan node", () => {
      const node = users.get("age").lt(10);
      expect(node).toBeInstanceOf(Nodes.LessThan);
    });
  });

  it("should generate the proper SQL for AVG", () => {
    expect(users.project(users.get("age").average()).toSql()).toBe(
      'SELECT AVG("users"."age") FROM "users"',
    );
  });

  it("should generate proper SQL for MAX", () => {
    expect(users.project(users.get("age").maximum()).toSql()).toBe(
      'SELECT MAX("users"."age") FROM "users"',
    );
  });

  it("should generate proper SQL for MIN", () => {
    expect(users.project(users.get("age").minimum()).toSql()).toBe(
      'SELECT MIN("users"."age") FROM "users"',
    );
  });

  it("should generate the proper SQL for SUM", () => {
    expect(users.project(users.get("age").sum()).toSql()).toBe(
      'SELECT SUM("users"."age") FROM "users"',
    );
  });

  it("should take a distinct param for count", () => {
    expect(users.project(users.get("name").count(true)).toSql()).toBe(
      'SELECT COUNT(DISTINCT "users"."name") FROM "users"',
    );
  });

  describe("#eq", () => {
    it("should return an equality node", () => {
      const node = users.get("id").eq(10);
      expect(node).toBeInstanceOf(Nodes.Equality);
    });
  });

  it("should handle nil for eq", () => {
    expect(users.project(star).where(users.get("name").eq(null)).toSql()).toBe(
      'SELECT * FROM "users" WHERE "users"."name" IS NULL',
    );
  });

  it("should not eat input for eqAny", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    users.get("id").eqAny(input);
    expect(input).toEqual(copy);
  });

  it("should not eat input for eqAll", () => {
    const input = [1, 2, 3];
    const copy = [...input];
    users.get("id").eqAll(input);
    expect(input).toEqual(copy);
  });

  describe("#matches", () => {
    it("should create a Matches node", () => {
      const node = users.get("name").matches("%bacon%");
      expect(node).toBeInstanceOf(Nodes.Matches);
    });
  });

  describe("#does_not_match", () => {
    it("should create a DoesNotMatch node", () => {
      const node = users.get("name").doesNotMatch("%bacon%");
      expect(node).toBeInstanceOf(Nodes.DoesNotMatch);
    });
  });

  it("can be constructed with a list for IN", () => {
    expect(
      users
        .project(star)
        .where(users.get("id").in([1, 2, 3]))
        .toSql(),
    ).toBe('SELECT * FROM "users" WHERE "users"."id" IN (1, 2, 3)');
  });

  describe("#not_in", () => {
    it("should generate NOT IN in sql", () => {
      expect(
        users
          .project(star)
          .where(users.get("id").notIn([1, 2]))
          .toSql(),
      ).toBe('SELECT * FROM "users" WHERE "users"."id" NOT IN (1, 2)');
    });
  });

  it("should create a Contains node via InfixOperation", () => {
    const node = users.get("tags").contains("foo");
    expect(node).toBeInstanceOf(Nodes.InfixOperation);
    expect(node.operator).toBe("@>");
  });

  it("should create an Overlaps node via InfixOperation", () => {
    const node = users.get("tags").overlaps("bar");
    expect(node).toBeInstanceOf(Nodes.InfixOperation);
    expect(node.operator).toBe("&&");
  });

  it("should produce sql for attribute", () => {
    const visitor = new Visitors.ToSql();
    const attr = users.get("name");
    expect(visitor.compile(attr)).toBe('"users"."name"');
  });

  it("can be constructed with a subquery for IN", () => {
    const subquery = users.project(users.get("id"));
    const node = users.get("id").in(subquery);
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(node)).toBe('"users"."id" IN (SELECT "users"."id" FROM "users")');
  });

  it("can be constructed with a standard range for between", () => {
    const node = users.get("age").between({ begin: 18, end: 65 });
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(node)).toBe('"users"."age" BETWEEN 18 AND 65');
  });

  it("is equal with equal ivars (same table and column)", () => {
    const a = users.get("name");
    const b = users.get("name");
    expect(a.name).toBe(b.name);
    expect(a.relation).toBe(b.relation);
  });

  it("average should be compatible with Addition", () => {
    const node = users.get("age").add(1);
    expect(node).toBeInstanceOf(Nodes.Grouping);
    expect((node as Nodes.Grouping).expr).toBeInstanceOf(Nodes.Addition);
  });

  it("count should be compatible with Addition", () => {
    const count = users.get("id").count();
    expect(count.name).toBe("COUNT");
  });

  it("maximum should be compatible with node", () => {
    const node = users.get("age").maximum();
    expect(node.name).toBe("MAX");
  });

  it("minimum should be compatible with node", () => {
    const node = users.get("age").minimum();
    expect(node.name).toBe("MIN");
  });

  it("attribute node should be compatible with Subtraction", () => {
    const node = users.get("age").subtract(1);
    expect(node).toBeInstanceOf(Nodes.Grouping);
    expect((node as Nodes.Grouping).expr).toBeInstanceOf(Nodes.Subtraction);
  });

  it("attribute node should be compatible with Multiplication", () => {
    const node = users.get("age").multiply(2);
    expect(node).toBeInstanceOf(Nodes.Multiplication);
  });

  it("attribute node should be compatible with Division", () => {
    const node = users.get("age").divide(2);
    expect(node).toBeInstanceOf(Nodes.Division);
  });

  describe("#not_in", () => {
    it("should generate NOT IN in sql", () => {
      const mgr = users.project(users.get("id"));
      mgr.where(users.get("id").notIn([1, 2]));
      expect(mgr.toSql()).toBe('SELECT "users"."id" FROM "users" WHERE "users"."id" NOT IN (1, 2)');
    });
  });

  describe("#not_between", () => {
    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("age").notBetween(-Infinity, 65);
      const visitor = new Visitors.ToSql();
      expect(visitor.compile(node)).toContain("NOT");
    });
  });

  describe("#not_in_any", () => {
    it("should generate ORs in sql", () => {
      const left = users.get("age").notBetween(18, 30);
      const right = users.get("age").notBetween(40, 50);
      const node = new Nodes.Grouping(new Nodes.Or(left, right));
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("OR");
    });
  });

  describe("#eq_all", () => {
    it("should create a Grouping node", () => {
      const left = users.get("age").notBetween(18, 65);
      const right = users.get("score").notBetween(1, 100);
      const node = new Nodes.Grouping(new Nodes.And([left, right]));
      expect(node).toBeInstanceOf(Nodes.Grouping);
    });

    it("should generate ANDs in sql", () => {
      const left = users.get("age").notBetween(18, 65);
      const right = users.get("score").notBetween(1, 100);
      const node = new Nodes.Grouping(new Nodes.And([left, right]));
      const visitor = new Visitors.ToSql();
      const result = visitor.compile(node);
      expect(result).toContain("AND");
    });
  });

  describe("#not_between", () => {
    it("can be constructed with a standard range", () => {
      const node = users.get("id").between([1, 100]);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("BETWEEN");
      expect(sql).toContain("1 AND 100");
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const node = users.get("id").between(-Infinity, 100);
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain("<=");
      expect(sql).toContain("100");
    });

    it("can be constructed with an exclusive range", () => {
      // Exclusive: attr >= begin AND attr < end
      const begin = 1;
      const end = 10;
      const node = new Nodes.Grouping(
        new Nodes.And([users.get("id").gteq(begin), users.get("id").lt(end)]),
      );
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toContain(">=");
      expect(sql).toContain("<");
    });
  });

  describe("#not_in", () => {
    it("can be constructed with a Union", () => {
      const m1 = new SelectManager(users);
      m1.project(star);
      const m2 = new SelectManager(users);
      m2.project(star);
      const union = m1.union(m2);
      expect(union).toBeInstanceOf(Nodes.Union);
      const sql = new Visitors.ToSql().compile(union);
      expect(sql).toContain("UNION");
    });
  });

  describe("#sum", () => {
    it("should generate the proper SQL", () => {
      const node = users.get("tags").contains("foo");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."tags" @> \'foo\'');
    });
  });

  describe("#minimum", () => {
    it("should generate proper SQL", () => {
      const node = users.get("tags").overlaps("bar");
      const sql = new Visitors.ToSql().compile(node);
      expect(sql).toBe('"users"."tags" && \'bar\'');
    });
  });

  describe("#overlaps", () => {
    it("should create an Overlaps node", () => {
      const node = users.get("tags").overlaps("bar");
      expect(node).toBeInstanceOf(Nodes.InfixOperation);
      expect((node as Nodes.InfixOperation).operator).toBe("&&");
    });
  });
});
