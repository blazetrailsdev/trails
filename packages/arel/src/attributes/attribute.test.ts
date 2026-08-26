import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { fakeRecordConnection } from "../test-helpers/connection.js";
import { Table, star, Nodes, Visitors } from "../index.js";
import { Attribute } from "./attribute.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";

describe("AttributeTest", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql(fakeRecordConnection);

  // Mirrors Rails' private `quoted_range` (attribute_test.rb:1163-1169).
  function quotedRange(beginVal: unknown, endVal: unknown, exclude: boolean) {
    return {
      begin: new Nodes.Quoted(beginVal),
      end: new Nodes.Quoted(endVal),
      excludeEnd: exclude,
    };
  }

  // Mimic PG::TextDecoder::Array casting (attribute_test.rb:1171-1181).
  function fakePgCaster() {
    return {
      typeCastForDatabase(attrName: string, value: unknown) {
        return attrName === "tags" ? `{${(value as unknown[]).join(",")}}` : value;
      },
    };
  }
  describe("#not_eq", () => {
    it("should create a NotEqual node", () => {
      const relation = new Table("users");
      expect(relation.get("id").notEq(10)).toBeInstanceOf(Nodes.NotEqual);
    });

    it("should generate != in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").notEq(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" != 10
        `),
      );
    });

    it("should handle nil", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").notEq(null));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" IS NOT NULL
        `),
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
      const relation = new Table("users");
      expect(relation.get("id").gt(10)).toBeInstanceOf(Nodes.GreaterThan);
    });

    it("should generate > in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").gt(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" > 10
        `),
      );
    });

    it("should handle comparing with a subquery", () => {
      const avg = users.project(users.get("karma").average());
      const mgr = users.project(star()).where(users.get("karma").gt(avg));

      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT * FROM "users" WHERE "users"."karma" > (SELECT AVG("users"."karma") FROM "users")
        `),
      );
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").gt("fake_name"));
      expect(mgr.toSql()).toMatch(`"users"."name" > 'fake_name'`);

      // Rails interpolates `::Time.now`; a fixed Instant keeps the assertion
      // deterministic while reaching the same Ruby `Time#to_s` rendering arm.
      const currentTime = Temporal.Instant.from("2024-01-01T00:00:00Z");
      mgr.where(relation.get("created_at").gt(currentTime));
      expect(mgr.toSql()).toMatch(`"users"."created_at" > '2024-01-01 00:00:00 +0000'`);
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
      const relation = new Table("users");
      expect(relation.get("id").gteq(10)).toBeInstanceOf(Nodes.GreaterThanOrEqual);
    });

    it("should generate >= in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").gteq(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" >= 10
        `),
      );
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").gteq("fake_name"));
      expect(mgr.toSql()).toMatch(`"users"."name" >= 'fake_name'`);

      // Rails interpolates `::Time.now`; a fixed Instant keeps the assertion
      // deterministic while reaching the same Ruby `Time#to_s` rendering arm.
      const currentTime = Temporal.Instant.from("2024-01-01T00:00:00Z");
      mgr.where(relation.get("created_at").gteq(currentTime));
      expect(mgr.toSql()).toMatch(`"users"."created_at" >= '2024-01-01 00:00:00 +0000'`);
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
      const relation = new Table("users");
      expect(relation.get("id").lt(10)).toBeInstanceOf(Nodes.LessThan);
    });

    it("should generate < in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").lt(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" < 10
        `),
      );
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").lt("fake_name"));
      expect(mgr.toSql()).toMatch(`"users"."name" < 'fake_name'`);

      // Rails interpolates `::Time.now`; a fixed Instant keeps the assertion
      // deterministic while reaching the same Ruby `Time#to_s` rendering arm.
      const currentTime = Temporal.Instant.from("2024-01-01T00:00:00Z");
      mgr.where(relation.get("created_at").lt(currentTime));
      expect(mgr.toSql()).toMatch(`"users"."created_at" < '2024-01-01 00:00:00 +0000'`);
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
      const relation = new Table("users");
      expect(relation.get("id").lteq(10)).toBeInstanceOf(Nodes.LessThanOrEqual);
    });

    it("should generate <= in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").lteq(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" <= 10
        `),
      );
    });

    it("should accept various data types.", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").lteq("fake_name"));
      expect(mgr.toSql()).toMatch(`"users"."name" <= 'fake_name'`);

      // Rails interpolates `::Time.now`; a fixed Instant keeps the assertion
      // deterministic while reaching the same Ruby `Time#to_s` rendering arm.
      const currentTime = Temporal.Instant.from("2024-01-01T00:00:00Z");
      mgr.where(relation.get("created_at").lteq(currentTime));
      expect(mgr.toSql()).toMatch(`"users"."created_at" <= '2024-01-01 00:00:00 +0000'`);
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
      const relation = new Table("users");
      expect(relation.get("id").average()).toBeInstanceOf(Nodes.Avg);
    });

    it("should generate the proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").average());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT AVG("users"."id")
          FROM "users"
        `),
      );
    });
  });

  describe("#maximum", () => {
    it("should create a MAX node", () => {
      const relation = new Table("users");
      expect(relation.get("id").maximum()).toBeInstanceOf(Nodes.Max);
    });

    it("should generate proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").maximum());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT MAX("users"."id")
          FROM "users"
        `),
      );
    });
  });

  describe("#minimum", () => {
    it("should create a Min node", () => {
      const relation = new Table("users");
      expect(relation.get("id").minimum()).toBeInstanceOf(Nodes.Min);
    });

    it("should generate proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").minimum());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT MIN("users"."id")
          FROM "users"
        `),
      );
    });
  });

  describe("#sum", () => {
    it("should create a SUM node", () => {
      const relation = new Table("users");
      expect(relation.get("id").sum()).toBeInstanceOf(Nodes.Sum);
    });

    it("should generate the proper SQL", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id").sum());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT SUM("users"."id")
          FROM "users"
        `),
      );
    });
  });

  describe("#count", () => {
    it("should return a count node", () => {
      const relation = new Table("users");
      expect(relation.get("id").count()).toBeInstanceOf(Nodes.Count);
    });

    it("should take a distinct param", () => {
      const relation = new Table("users");
      const count = relation.get("id").count(null);
      expect(count).toBeInstanceOf(Nodes.Count);
      expect(count.distinct).toBeNull();
    });
  });

  describe("#eq", () => {
    it("should return an equality node", () => {
      const attribute = new Attribute(null, null);
      const equality = attribute.eq(1);
      expect(equality.left).toEqual(attribute);
      expect((equality.right as Nodes.Casted).value).toEqual(1);
      expect(equality).toBeInstanceOf(Nodes.Equality);
    });

    it("should generate = in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").eq(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" = 10
        `),
      );
    });

    it("should handle nil", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").eq(null));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" IS NULL
        `),
      );
    });
  });

  describe("#matches_any", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("name").matchesAny(["%chunky%", "%bacon%"])).toBeInstanceOf(
        Nodes.Grouping,
      );
    });

    it("should generate ORs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").matchesAny(["%chunky%", "%bacon%"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%chunky%' OR "users"."name" LIKE '%bacon%')
        `),
      );
    });
  });

  describe("#matches_all", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("name").matchesAll(["%chunky%", "%bacon%"])).toBeInstanceOf(
        Nodes.Grouping,
      );
    });

    it("should generate ANDs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").matchesAll(["%chunky%", "%bacon%"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE ("users"."name" LIKE '%chunky%' AND "users"."name" LIKE '%bacon%')
        `),
      );
    });
  });

  describe("#matches", () => {
    it("should create a Matches node", () => {
      const relation = new Table("users");
      expect(relation.get("name").matches("%bacon%")).toBeInstanceOf(Nodes.Matches);
    });

    it("should generate LIKE in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").matches("%bacon%"));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."name" LIKE '%bacon%'
        `),
      );
    });
  });

  describe("#does_not_match_any", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("name").doesNotMatchAny(["%chunky%", "%bacon%"])).toBeInstanceOf(
        Nodes.Grouping,
      );
    });

    it("should generate ORs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").doesNotMatchAny(["%chunky%", "%bacon%"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%chunky%' OR "users"."name" NOT LIKE '%bacon%')
        `),
      );
    });
  });

  describe("#does_not_match_all", () => {
    it("should create a Grouping node", () => {
      const relation = new Table("users");
      expect(relation.get("name").doesNotMatchAll(["%chunky%", "%bacon%"])).toBeInstanceOf(
        Nodes.Grouping,
      );
    });

    it("should generate ANDs in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").doesNotMatchAll(["%chunky%", "%bacon%"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE ("users"."name" NOT LIKE '%chunky%' AND "users"."name" NOT LIKE '%bacon%')
        `),
      );
    });
  });

  describe("#does_not_match", () => {
    it("should create a DoesNotMatch node", () => {
      const relation = new Table("users");
      expect(relation.get("name").doesNotMatch("%bacon%")).toBeInstanceOf(Nodes.DoesNotMatch);
    });

    it("should generate NOT LIKE in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").doesNotMatch("%bacon%"));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."name" NOT LIKE '%bacon%'
        `),
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
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 1, end: 3 });

      expect(node).toEqual(
        new Nodes.Between(
          attribute,
          new Nodes.And([new Nodes.Casted(1, attribute), new Nodes.Casted(3, attribute)]),
        ),
      );
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: -Infinity, end: 3 });

      expect(node).toEqual(new Nodes.LessThanOrEqual(attribute, new Nodes.Casted(3, attribute)));
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between(quotedRange(-Infinity, 3, false));

      expect(node).toEqual(new Nodes.LessThanOrEqual(attribute, new Nodes.Quoted(3)));
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: -Infinity, end: 3, excludeEnd: true });

      expect(node).toEqual(new Nodes.LessThan(attribute, new Nodes.Casted(3, attribute)));
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between(quotedRange(-Infinity, 3, true));

      expect(node).toEqual(new Nodes.LessThan(attribute, new Nodes.Quoted(3)));
    });

    it("can be constructed with an infinite range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: -Infinity, end: Infinity });

      expect(node).toEqual(new Nodes.NotIn(attribute, []));
    });

    it("can be constructed with a quoted infinite range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between(quotedRange(-Infinity, Infinity, false));

      expect(node).toEqual(new Nodes.NotIn(attribute, []));
    });

    it("can be constructed with a range ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 0, end: Infinity });

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: null, end: 0 });

      expect(node).toEqual(new Nodes.LessThanOrEqual(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 0, end: null });

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with an exclusive range implicitly ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 0, end: null, excludeEnd: true });

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between(quotedRange(0, Infinity, false));

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Quoted(0)));
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: Infinity, end: null });

      expect(node).toEqual(new Nodes.In(attribute, []));
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: null, end: -Infinity });

      expect(node).toEqual(new Nodes.In(attribute, []));
    });

    it("can be constructed with an exclusive range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 0, end: 3, excludeEnd: true });

      expect(node).toEqual(
        new Nodes.And([
          new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(0, attribute)),
          new Nodes.LessThan(attribute, new Nodes.Casted(3, attribute)),
        ]),
      );
    });

    it("can be constructed with a range where the begin and end are equal", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.between({ begin: 1, end: 1 });

      expect(node).toEqual(new Nodes.Equality(attribute, new Nodes.Casted(1, attribute)));
    });
  });

  describe("#not_between", () => {
    it("can be constructed with a standard range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: 1, end: 3 });

      expect(node).toEqual(
        new Nodes.Grouping(
          new Nodes.Or([
            new Nodes.LessThan(attribute, new Nodes.Casted(1, attribute)),
            new Nodes.GreaterThan(attribute, new Nodes.Casted(3, attribute)),
          ]),
        ),
      );
    });

    it("can be constructed with a range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: -Infinity, end: 3 });

      expect(node).toEqual(new Nodes.GreaterThan(attribute, new Nodes.Casted(3, attribute)));
    });

    it("can be constructed with a quoted range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween(quotedRange(-Infinity, 3, false));

      expect(node).toEqual(new Nodes.GreaterThan(attribute, new Nodes.Quoted(3)));
    });

    it("can be constructed with an exclusive range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: -Infinity, end: 3, excludeEnd: true });

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(3, attribute)));
    });

    it("can be constructed with a quoted exclusive range starting from -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween(quotedRange(-Infinity, 3, true));

      expect(node).toEqual(new Nodes.GreaterThanOrEqual(attribute, new Nodes.Quoted(3)));
    });

    it("can be constructed with an infinite range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: -Infinity, end: Infinity });

      expect(node).toEqual(new Nodes.In(attribute, []));
    });

    it("can be constructed with a quoted infinite range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween(quotedRange(-Infinity, Infinity, false));

      expect(node).toEqual(new Nodes.In(attribute, []));
    });

    it("can be constructed with a range ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: 0, end: Infinity });

      expect(node).toEqual(new Nodes.LessThan(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a range implicitly starting at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: null, end: 0 });

      expect(node).toEqual(new Nodes.GreaterThan(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a range implicitly ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: 0, end: null });

      expect(node).toEqual(new Nodes.LessThan(attribute, new Nodes.Casted(0, attribute)));
    });

    it("can be constructed with a quoted range ending at Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween(quotedRange(0, Infinity, false));

      expect(node).toEqual(new Nodes.LessThan(attribute, new Nodes.Quoted(0)));
    });

    it("can be constructed with an endless range starting from Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: Infinity, end: null });

      expect(node).toEqual(new Nodes.NotIn(attribute, []));
    });

    it("can be constructed with a beginless range ending in -Infinity", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: null, end: -Infinity });

      expect(node).toEqual(new Nodes.NotIn(attribute, []));
    });

    it("can be constructed with an exclusive range", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notBetween({ begin: 0, end: 3, excludeEnd: true });

      expect(node).toEqual(
        new Nodes.Grouping(
          new Nodes.Or([
            new Nodes.LessThan(attribute, new Nodes.Casted(0, attribute)),
            new Nodes.GreaterThanOrEqual(attribute, new Nodes.Casted(3, attribute)),
          ]),
        ),
      );
    });
  });

  describe("#not_in", () => {
    it("can be constructed with a subquery", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").doesNotMatchAll(["%chunky%", "%bacon%"]));
      const attribute = new Attribute(null, null);

      const node = attribute.notIn(mgr);

      expect(node).toEqual(new Nodes.NotIn(attribute, mgr.ast));
    });

    it("can be constructed with a Union", () => {
      const relation = new Table("users");
      const mgr1 = relation.project(relation.get("id"));
      const mgr2 = relation.project(relation.get("id"));

      const union = mgr1.union(mgr2);
      const node = relation.get("id").in(union);
      expect(mustBeLike(visitor.compile(node))).toBe(
        mustBeLike(`
          "users"."id" IN (( SELECT "users"."id" FROM "users" UNION SELECT "users"."id" FROM "users" ))
        `),
      );
    });

    it("can be constructed with a list", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.notIn([1, 2, 3]);

      expect(node).toEqual(
        new Nodes.NotIn(attribute, [
          new Nodes.Casted(1, attribute),
          new Nodes.Casted(2, attribute),
          new Nodes.Casted(3, attribute),
        ]),
      );
    });

    it("can be constructed with a random object", () => {
      const attribute = new Attribute(null, null);
      const randomObject = {};
      const node = attribute.notIn(randomObject);

      expect(node).toEqual(new Nodes.NotIn(attribute, new Nodes.Casted(randomObject, attribute)));
    });

    it("should generate NOT IN in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").notIn([1, 2, 3]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" NOT IN (1, 2, 3)
        `),
      );
    });
  });

  describe("#in", () => {
    it("should generate IN in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("id").in([1, 2, 3]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" WHERE "users"."id" IN (1, 2, 3)
        `),
      );
    });

    it("can be constructed with a subquery", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("name").doesNotMatchAll(["%chunky%", "%bacon%"]));
      const attribute = new Attribute(null, null);

      const node = attribute.in(mgr);

      expect(node).toEqual(new Nodes.In(attribute, mgr.ast));
    });

    it("can be constructed with a list", () => {
      const attribute = new Attribute(null, null);
      const node = attribute.in([1, 2, 3]);

      expect(node).toEqual(
        new Nodes.In(attribute, [
          new Nodes.Casted(1, attribute),
          new Nodes.Casted(2, attribute),
          new Nodes.Casted(3, attribute),
        ]),
      );
    });

    it("can be constructed with a random object", () => {
      const attribute = new Attribute(null, null);
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
      const relation = new Table("users");
      expect(relation.get("id").asc()).toBeInstanceOf(Nodes.Ascending);
    });

    it("should generate ASC in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.order(relation.get("id").asc());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" ORDER BY "users"."id" ASC
        `),
      );
    });
  });

  describe("#desc", () => {
    it("should create a Descending node", () => {
      const relation = new Table("users");
      expect(relation.get("id").desc()).toBeInstanceOf(Nodes.Descending);
    });

    it("should generate DESC in sql", () => {
      const relation = new Table("users");
      const mgr = relation.project(relation.get("id"));
      mgr.order(relation.get("id").desc());
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
          SELECT "users"."id" FROM "users" ORDER BY "users"."id" DESC
        `),
      );
    });
  });

  describe("#contains", () => {
    it("should create a Contains node", () => {
      const relation = new Table("products");
      expect(relation.get("tags").contains(["foo", "bar"])).toBeInstanceOf(Nodes.Contains);
    });

    it("should generate @> in sql", () => {
      const relation = new Table("products", { typeCaster: fakePgCaster() });
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("tags").contains(["foo", "bar"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(
          ` SELECT "products"."id" FROM "products" WHERE "products"."tags" @> '{foo,bar}' `,
        ),
      );
    });
  });

  describe("#overlaps", () => {
    it("should create an Overlaps node", () => {
      const relation = new Table("products");
      expect(relation.get("tags").overlaps(["foo", "bar"])).toBeInstanceOf(Nodes.Overlaps);
    });

    it("should generate && in sql", () => {
      const relation = new Table("products", { typeCaster: fakePgCaster() });
      const mgr = relation.project(relation.get("id"));
      mgr.where(relation.get("tags").overlaps(["foo", "bar"]));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(
          ` SELECT "products"."id" FROM "products" WHERE "products"."tags" && '{foo,bar}' `,
        ),
      );
    });
  });

  describe("equality", () => {
    describe("#to_sql", () => {
      it("should produce sql", () => {
        const table = new Table("users");
        const condition = table.get("id").eq(1);
        expect(visitor.compile(condition)).toBe('"users"."id" = 1');
      });
    });
  });

  describe("type casting", () => {
    it("does not type cast by default", () => {
      const table = new Table("foo");
      const condition = table.get("id").eq("1");

      expect(table.isAbleToTypeCast()).toBeFalsy();
      expect(new Visitors.ToSql(fakeRecordConnection).compile(condition)).toBe(
        '"foo"."id" = \'1\'',
      );
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
      expect(new Visitors.ToSql(fakeRecordConnection).compile(condition)).toBe(
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
      expect(new Visitors.ToSql(fakeRecordConnection).compile(condition)).toBe(
        '"foo"."id" = (select 1)',
      );
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
