import { describe, it, expect } from "vitest";
import { Table, sql, star, SelectManager, Nodes, Visitors } from "./index.js";

describe("TableTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("should create join nodes", () => {
    const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
    expect(join).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.FullOuterJoin);
    expect(join).toBeInstanceOf(Nodes.FullOuterJoin);
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.OuterJoin);
    expect(join).toBeInstanceOf(Nodes.OuterJoin);
  });

  it("should create join nodes with a klass", () => {
    const join = users.createJoin("foo", "bar", Nodes.RightOuterJoin);
    expect(join).toBeInstanceOf(Nodes.RightOuterJoin);
  });

  describe("createJoin with On constraint", () => {
    it("should produce LEFT OUTER JOIN … ON SQL", () => {
      const onClause = new Nodes.On(users.get("id").eq(posts.get("user_id")));
      const join = users.createJoin(posts, onClause, Nodes.OuterJoin);
      const mgr = users.project(star);
      mgr.appendJoinNode(join);
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
      const mgr = users.project(star);
      mgr.skip(10);
      expect(mgr.toSql()).toContain("OFFSET 10");
    });
  });

  describe("having", () => {
    it("adds a having clause", () => {
      const mgr = users.having(sql("COUNT(*) > 1")).project(star);
      expect(mgr.toSql()).toContain("HAVING");
    });
  });

  describe("backwards compat", () => {
    describe("join", () => {
      it("noops on nil", () => {
        const mgr = users.join(null);
        expect(mgr.toSql()).toContain("FROM");
        expect(mgr.toSql()).not.toContain("JOIN");
      });

      it("raises EmptyJoinError on empty", () => {
        expect(() => users.join("")).toThrow("EmptyJoinError");
      });

      it("takes a second argument for join type", () => {
        const right = users.alias();
        const predicate = users.get("id").eq(right.get("id"));
        const mgr = users.join(right, Nodes.OuterJoin).on(predicate);
        expect(mgr.toSql()).toContain("LEFT OUTER JOIN");
      });

      it("creates an outer join", () => {
        const right = users.alias();
        const predicate = users.get("id").eq(right.get("id"));
        const mgr = users.outerJoin(right).on(predicate);
        expect(mgr.toSql()).toContain("LEFT OUTER JOIN");
      });
    });
  });

  describe("group", () => {
    it("should create a group", () => {
      const mgr = users.group(users.get("age")).project(star);
      expect(mgr.toSql()).toContain("GROUP BY");
    });
  });

  describe("new", () => {
    it("should accept a hash", () => {
      // Table where accepts node conditions
      const mgr = users.where(users.get("id").eq(1));
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("ignores as if it equals name", () => {
      const t = new Table("users", { as: "users" });
      expect(t.name).toBe("users");
      expect(t.tableAlias).toBeNull();
    });

    it("should accept literal SQL", () => {
      const mgr = users.project(sql("1 as one"));
      const result = mgr.toSql();
      expect(result).toContain("1 as one");
    });

    it("should accept Arel nodes", () => {
      const mgr = users.project(users.get("id"));
      const result = mgr.toSql();
      expect(result).toContain('"users"."id"');
    });
  });

  describe("order", () => {
    it("should take an order", () => {
      const mgr = users.order(users.get("name").asc()).project(star);
      expect(mgr.toSql()).toContain("ORDER BY");
    });
  });

  describe("take", () => {
    it("should add a limit", () => {
      const mgr = users.take(10).project(star);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });
  });

  describe("project", () => {
    it("can project", () => {
      const mgr = users.project(users.get("name"));
      expect(mgr.toSql()).toContain('"name"');
    });

    it("takes multiple parameters", () => {
      const mgr = users.project(users.get("name"), users.get("email"));
      expect(mgr.toSql()).toContain('"name"');
      expect(mgr.toSql()).toContain('"email"');
    });
  });

  describe("where", () => {
    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
    });
  });

  describe("[]", () => {
    describe("when given a Symbol", () => {
      it("manufactures an attribute if the symbol names an attribute within the relation", () => {
        const attr = users.get("id");
        expect(attr).toBeInstanceOf(Nodes.Attribute);
        expect(attr.name).toBe("id");
        expect(attr.relation).toBe(users);
      });
    });
  });

  describe("equality", () => {
    it("is equal with equal ivars", () => {
      const a = new Nodes.And([users.get("id").eq(1)]);
      const b = new Nodes.And([users.get("id").eq(1)]);
      expect(a.children.length).toBe(b.children.length);
    });

    it("is not equal with different ivars", () => {
      const a = users.get("name");
      const b = users.get("email");
      expect(a.name).not.toBe(b.name);
    });
  });

  it("has a name", () => {
    expect(users.name).toBe("users");
  });

  it("manufactures an Attribute via attr()", () => {
    expect(users.attr("email").name).toBe("email");
  });

  it("accepts :as option for table alias", () => {
    const aliased = new Table("users", { as: "u" });
    expect(aliased.tableAlias).toBe("u");
  });

  it("star returns an Attribute that compiles to table.*", () => {
    expect(users.star).toBeInstanceOf(Nodes.Attribute);
    expect(users.star.toSql()).toBe('"users".*');
  });

  it("star splits schema-qualified name", () => {
    expect(new Table("test_schema.things").star.toSql()).toBe('"test_schema"."things".*');
  });

  it("star preserves quoted table name with dot", () => {
    expect(new Table('test_schema."things.table"').star.toSql()).toBe(
      '"test_schema"."things.table".*',
    );
  });

  it("star preserves quoted schema name with dot", () => {
    expect(new Table('"my.schema".articles').star.toSql()).toBe('"my.schema"."articles".*');
  });

  it("star routes table-name quoting through the adapter visitor (MySQL=backticks)", () => {
    const sql = new Visitors.MySQL().compile(users.star);
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
    mgr.project(star);
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

  it("should accept a hash (constructor options)", () => {
    const t = new Table("users", { as: "u" });
    expect(t.tableAlias).toBe("u");
  });

  describe("where", () => {
    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
    });
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
      const aliased = users.as("u");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.relation).toBe(users);
      const sql = new Visitors.ToSql().compile(aliased.get("id"));
      expect(sql).toBe('"u"."id"');
    });
  });

  it("should have a name", () => {
    const t = new Table("widgets");
    expect(t.name).toBe("widgets");
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
      const aliased = users.as("u");
      const attr = users.get("id", aliased);
      expect(attr.relation).toBe(aliased);
      expect(new Visitors.ToSql().compile(attr)).toBe('"u"."id"');
    });
  });

  describe("attribute_aliases", () => {
    it("resolves an aliased attribute name", () => {
      const t = new Table("users", { klass: { _attributeAliases: { nickname: "name" } } });
      const attr = t.get("nickname");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("name");
    });

    it("passes through an unaliased attribute name", () => {
      const t = new Table("users", { klass: { _attributeAliases: { nickname: "name" } } });
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
