import { describe, it, expect } from "vitest";
import { testConnection } from "../test-helpers/connection.js";
import { Table, star, Nodes, Visitors } from "../index.js";

describe("AttributeTest (trails)", () => {
  const users = new Table("users");
  const visitor = new Visitors.ToSql(testConnection);

  describe("#in", () => {
    it("expands a Set through the Enumerable arm", () => {
      const node = users.get("id").in(new Set([1, 2, 3]));
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2, 3)');
    });

    it("expands a generator through the Enumerable arm", () => {
      function* ids(): Generator<number> {
        yield 1;
        yield 2;
      }
      const node = users.get("id").in(ids());
      expect(visitor.compile(node)).toBe('"users"."id" IN (1, 2)');
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const attribute = users.get("id");
      const randomObject = {};
      expect(attribute.in(randomObject)).toEqual(
        new Nodes.In(attribute, new Nodes.Casted(randomObject, attribute)),
      );
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const attribute = users.get("id");
      expect(attribute.in("abc")).toEqual(
        new Nodes.In(attribute, new Nodes.Casted("abc", attribute)),
      );
    });

    it("expands a Map into pairs, matching Ruby's Enumerable Hash", () => {
      const attribute = users.get("id");
      const map = new Map<string, number>([
        ["a", 1],
        ["b", 2],
      ]);
      expect(attribute.in(map)).toEqual(
        new Nodes.In(attribute, [
          new Nodes.Casted(["a", 1], attribute),
          new Nodes.Casted(["b", 2], attribute),
        ]),
      );
    });
  });

  describe("#not_in", () => {
    it("expands a Set through the Enumerable arm", () => {
      const node = users.get("id").notIn(new Set([1, 2]));
      expect(visitor.compile(node)).toBe('"users"."id" NOT IN (1, 2)');
    });

    it("casts a string through the scalar arm, since Ruby's String is not Enumerable", () => {
      const attribute = users.get("id");
      expect(attribute.notIn("abc")).toEqual(
        new Nodes.NotIn(attribute, new Nodes.Casted("abc", attribute)),
      );
    });

    it("casts a non-iterable object through the scalar arm", () => {
      const attribute = users.get("id");
      const randomObject = {};
      expect(attribute.notIn(randomObject)).toEqual(
        new Nodes.NotIn(attribute, new Nodes.Casted(randomObject, attribute)),
      );
    });

    it("expands a Map into pairs, matching Ruby's Enumerable Hash", () => {
      const attribute = users.get("id");
      const map = new Map<string, number>([["a", 1]]);
      expect(attribute.notIn(map)).toEqual(
        new Nodes.NotIn(attribute, [new Nodes.Casted(["a", 1], attribute)]),
      );
    });
  });

  describe("two-argument between overload", () => {
    it("between generates BETWEEN", () => {
      expect(
        users
          .project(star())
          .where(users.get("age").between({ begin: 18, end: 65 }))
          .toSql(),
      ).toBe('SELECT * FROM "users" WHERE "users"."age" BETWEEN 18 AND 65');
    });

    it("notBetween generates NOT BETWEEN", () => {
      expect(
        users
          .project(star())
          .where(users.get("age").notBetween({ begin: 18, end: 65 }))
          .toSql(),
      ).toBe('SELECT * FROM "users" WHERE ("users"."age" < 18 OR "users"."age" > 65)');
    });
  });

  describe("type casting", () => {
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
});
