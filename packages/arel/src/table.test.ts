import { describe, it, expect } from "vitest";
import { Table, sql, TreeManager, Nodes, EmptyJoinError } from "./index.js";

import { mustBeLike } from "./test-helpers/must-be-like.js";
import { uniq } from "./test-helpers/uniq.js";

describe("TableTest", () => {
  const users = new Table("users");
  it("should create join nodes", () => {
    const join = users.createJoin("foo", "bar");
    expect(join).toBeInstanceOf(Nodes.InnerJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.FullOuterJoin);
    expect(join).toBeInstanceOf(Nodes.FullOuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.OuterJoin);
    expect(join).toBeInstanceOf(Nodes.OuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.RightOuterJoin);
    expect(join).toBeInstanceOf(Nodes.RightOuterJoin);
    expect(join.left).toBe("foo");
    expect(join.right).toBe("bar");
  });

  describe("skip", () => {
    it("should add an offset", () => {
      const sm = users.skip(2);
      expect(mustBeLike(sm.toSql())).toBe(mustBeLike('SELECT FROM "users" OFFSET 2'));
    });
  });

  describe("having", () => {
    it("adds a having clause", () => {
      const mgr = users.having(users.get("id").eq(10));
      expect(mustBeLike(mgr.toSql())).toBe(
        mustBeLike(`
         SELECT FROM "users" HAVING "users"."id" = 10
        `),
      );
    });
  });

  describe("backwards compat", () => {
    describe("join", () => {
      it("noops on nil", () => {
        const mgr = users.join(null);
        expect(mgr.toSql()).toBe('SELECT FROM "users"');
      });

      it("raises EmptyJoinError on empty", () => {
        expect(() => users.join("")).toThrow(EmptyJoinError);
      });

      it("takes a second argument for join type", () => {
        const right = users.alias();
        const predicate = users.get("id").eq(right.get("id"));
        const mgr = users.join(right, Nodes.OuterJoin).on(predicate);
        expect(mgr.toSql()).toBe(
          'SELECT FROM "users" LEFT OUTER JOIN "users" "users_2" ON "users"."id" = "users_2"."id"',
        );
      });

      it("creates an outer join", () => {
        const right = users.alias();
        const predicate = users.get("id").eq(right.get("id"));
        const mgr = users.outerJoin(right).on(predicate);
        expect(mgr.toSql()).toBe(
          'SELECT FROM "users" LEFT OUTER JOIN "users" "users_2" ON "users"."id" = "users_2"."id"',
        );
      });
    });
  });

  describe("group", () => {
    it("should create a group", () => {
      const manager = users.group(users.get("id"));
      expect(mustBeLike(manager.toSql())).toBe(
        mustBeLike(`
          SELECT FROM "users" GROUP BY "users"."id"
        `),
      );
    });
  });

  describe("new", () => {
    it("should accept a hash", () => {
      const rel = new Table("users", { as: "foo" });
      expect(rel.tableAlias).toBe("foo");
    });

    it("ignores as if it equals name", () => {
      const rel = new Table("users", { as: "users" });
      expect(rel.tableAlias).toBeNull();
    });

    it("should accept literal SQL", () => {
      const rel = new Table(sql("generate_series(4, 2)"));
      expect(rel.name).toEqual(sql("generate_series(4, 2)"));
    });

    it("should accept Arel nodes", () => {
      const node = new Nodes.NamedFunction("generate_series", [4, 2]);
      const rel = new Table(node);
      expect(rel.name).toBe(node);
    });
  });

  describe("order", () => {
    it("should take an order", () => {
      const manager = users.order("foo");
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike('SELECT FROM "users" ORDER BY foo'));
    });
  });

  describe("take", () => {
    it("should add a limit", () => {
      const manager = users.take(1);
      manager.project(new Nodes.SqlLiteral("*"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike('SELECT * FROM "users" LIMIT 1'));
    });
  });

  describe("project", () => {
    it("can project", () => {
      const manager = users.project(new Nodes.SqlLiteral("*"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike('SELECT * FROM "users"'));
    });

    it("takes multiple parameters", () => {
      const manager = users.project(new Nodes.SqlLiteral("*"), new Nodes.SqlLiteral("*"));
      expect(mustBeLike(manager.toSql())).toBe(mustBeLike('SELECT *, * FROM "users"'));
    });
  });

  describe("where", () => {
    it("returns a tree manager", () => {
      const mgr = users.where(users.get("id").eq(1));
      mgr.project(users.get("id"));
      expect(mgr).toBeInstanceOf(TreeManager);
      expect(mgr.toSql()).toBe('SELECT "users"."id" FROM "users" WHERE "users"."id" = 1');
    });
  });

  describe("[]", () => {
    describe("when given a Symbol", () => {
      it("manufactures an attribute if the symbol names an attribute within the relation", () => {
        const column = users.get("id");
        expect(column.name).toBe("id");
      });
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const relation1 = new Table("users", { as: "zomg" });
      const relation2 = new Table("users", { as: "zomg" });
      const array = [relation1, relation2];
      expect(uniq(array).length).toBe(1);
    });

    it("is not equal with different ivars", () => {
      const relation1 = new Table("users", { as: "zomg" });
      const relation2 = new Table("users", { as: "zomg2" });
      const array = [relation1, relation2];
      expect(uniq(array).length).toBe(2);
    });
  });

  describe("alias", () => {
    it("should create a node that proxies to a table", () => {
      const node = users.alias();
      expect(node.name).toBe("users_2");
      expect(node.get("id").relation).toBe(node);
    });
  });

  it("should have a name", () => {
    expect(users.name).toBe("users");
  });
});
