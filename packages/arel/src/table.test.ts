import { describe, it, expect } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  TreeManager,
  Nodes,
  Visitors,
  EmptyJoinError,
} from "./index.js";
import {
  testConnection,
  fakeRecordConnection,
  mysqlTestConnection,
} from "./test-helpers/connection.js";
import { mustBeLike } from "./test-helpers/must-be-like.js";
import { uniq } from "./test-helpers/uniq.js";

describe("TableTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
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

  describe("createJoin with On constraint", () => {
    it("should produce LEFT OUTER JOIN … ON SQL", () => {
      const onClause = new Nodes.On(users.get("id").eq(posts.get("user_id")));
      const join = users.createJoin(posts, onClause, Nodes.OuterJoin);
      const mgr = users.project(star());
      mgr.joinSources().push(join);
      const sql = mgr.toSql();
      expect(sql).toContain('LEFT OUTER JOIN "posts" ON "users"."id" = "posts"."user_id"');
    });

    it("should accept As nodes in the select list", () => {
      const mgr = users.project(users.get("id").as("t0_r0"), users.get("name").as("t0_r1"));
      const sql = mgr.toSql();
      expect(sql).toContain("AS t0_r0");
      expect(sql).toContain("AS t0_r1");
    });
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

  it("has a name", () => {
    expect(users.name).toBe("users");
  });

  it("manufactures an Attribute via attr()", () => {
    expect(users.get("email").name).toBe("email");
  });

  it("accepts :as option for table alias", () => {
    const aliased = new Table("users", { as: "u" });
    expect(aliased.tableAlias).toBe("u");
  });

  it("star returns an Attribute that compiles to table.*", () => {
    expect(users.get(star())).toBeInstanceOf(Nodes.Attribute);
    expect(users.get(star()).toSql()).toBe('"users".*');
  });

  it("star splits schema-qualified name", () => {
    expect(
      new Visitors.ToSql(testConnection).compile(new Table("test_schema.things").get(star())),
    ).toBe('"test_schema"."things".*');
  });

  it("star routes table-name quoting through the adapter visitor (MySQL=backticks)", () => {
    const sql = new Visitors.MySQL(mysqlTestConnection).compile(users.get(star()));
    expect(sql).toBe("`users`.*");
  });

  it("alias references use the alias in SQL", () => {
    const u = new Table("users", { as: "u" });
    const result = u.project(u.get("name")).toSql();
    expect(result).toBe('SELECT "u"."name" FROM "users" "u"');
  });

  it("returns a SelectManager with the table as source", () => {
    const mgr = users.from();
    expect(mgr).toBeInstanceOf(SelectManager);
    mgr.project(star());
    expect(mgr.toSql()).toBe('SELECT * FROM "users"');
  });

  it("alias() defaults name to table_2", () => {
    const aliased = users.alias();
    expect(aliased.name).toBe("users_2");
  });

  it("createTableAlias() creates a TableAlias node", () => {
    const alias = users.createTableAlias(users, "u");
    expect(alias).toBeInstanceOf(Nodes.TableAlias);
    expect(alias.name).toBe("u");
  });

  it("should create a node that proxies to a table (alias)", () => {
    const aliased = users.alias("u");
    expect(aliased).toBeInstanceOf(Nodes.TableAlias);
    expect(aliased.name).toBe("u");
  });

  it("manufactures an attribute", () => {
    const attr = users.get("id");
    expect(attr).toBeInstanceOf(Nodes.Attribute);
    expect(attr.name).toBe("id");
    expect(attr.relation).toBe(users);
  });

  it("is equal with equal ivars (same name)", () => {
    const a = new Table("users");
    const b = new Table("users");
    expect(a.name).toBe(b.name);
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

  describe("[] (get) with explicit table", () => {
    it("builds an attribute on the provided table", () => {
      const other = new Table("others");
      const attr = users.get("id", other);
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.relation).toBe(other);
      expect(attr.name).toBe("id");
    });

    it("builds an attribute on a TableAlias", () => {
      const aliased = users.alias("u");
      const attr = users.get("id", aliased);
      expect(attr.relation).toBe(aliased);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(attr)).toBe('"u"."id"');
    });
  });

  describe("attribute_aliases", () => {
    it("resolves an aliased attribute name", () => {
      const t = new Table("users", { klass: { attributeAliases: { nickname: "name" } } });
      const attr = t.get("nickname");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("name");
    });

    it("passes through an unaliased attribute name", () => {
      const t = new Table("users", { klass: { attributeAliases: { nickname: "name" } } });
      const attr = t.get("name");
      expect(attr.name).toBe("name");
    });

    it("passes through when no klass is set", () => {
      const t = new Table("users");
      const attr = t.get("nickname");
      expect(attr.name).toBe("nickname");
    });
  });

  describe("equality", () => {
    it("eql returns true for tables with the same name", () => {
      expect(new Table("users").eql(new Table("users"))).toBe(true);
    });

    it("eql returns false for different names", () => {
      expect(new Table("users").eql(new Table("posts"))).toBe(false);
    });

    it("eql compares tableAlias", () => {
      const a = new Table("users", { as: "u" });
      const b = new Table("users", { as: "u" });
      const c = new Table("users");
      expect(a.eql(b)).toBe(true);
      expect(a.eql(c)).toBe(false);
    });

    it("hash is stable for the same name", () => {
      expect(new Table("users").hash()).toBe(new Table("users").hash());
    });

    it("hash differs for different names", () => {
      expect(new Table("users").hash()).not.toBe(new Table("posts").hash());
    });
  });
});
