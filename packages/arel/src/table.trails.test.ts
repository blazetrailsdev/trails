import { describe, it, expect } from "vitest";
import { Table, Nodes, EmptyJoinError, star, Visitors, SelectManager } from "./index.js";
import {
  testConnection,
  mysqlTestConnection,
  fakeRecordConnection,
} from "./test-helpers/connection.js";

describe("TableTest (trails)", () => {
  const users = new Table("users");

  it("promotes a SqlLiteral relation to a StringJoin", () => {
    const mgr = users.join(new Nodes.SqlLiteral("comments ON comments.user_id = users.id"));
    const join = mgr.ast.cores[0].source.right[0];
    expect(join).toBeInstanceOf(Nodes.StringJoin);
    expect(mgr.toSql()).toBe('SELECT FROM "users" comments ON comments.user_id = users.id');
  });

  it("raises EmptyJoinError on an empty SqlLiteral", () => {
    expect(() => users.join(new Nodes.SqlLiteral(""))).toThrow(EmptyJoinError);
  });

  it("does not raise on a whitespace-only relation", () => {
    expect(() => users.join(" ")).not.toThrow();
  });

  it("as returns an AliasPredication As node, not a TableAlias", () => {
    const aliased = users.as("u");
    expect(aliased).toBeInstanceOf(Nodes.As);
    expect(aliased.left).toBe(users);
    expect(aliased.right).toBeInstanceOf(Nodes.SqlLiteral);
    expect((aliased.right as Nodes.SqlLiteral).value).toBe("u");
    expect(users.alias("u")).toBeInstanceOf(Nodes.TableAlias);
  });
});

describe("TableTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
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
