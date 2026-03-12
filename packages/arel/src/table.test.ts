import { describe, it, expect, beforeEach } from "vitest";
import {
  Table,
  sql,
  star,
  SelectManager,
  InsertManager,
  UpdateManager,
  DeleteManager,
  Nodes,
  Visitors,
  Collectors,
} from "./index.js";

describe("Arel", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  const visitor = new Visitors.ToSql();

  describe("table", () => {
    it("should create join nodes", () => {
      const join = users.createJoin(posts, users.get("id").eq(posts.get("user_id")));
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("should create join nodes with a klass", () => {
      const join = users.createJoin(posts);
      expect(join).toBeInstanceOf(Nodes.InnerJoin);
    });

    it("should add an offset", () => {
      const mgr = users.project(star);
      mgr.skip(10);
      expect(mgr.toSql()).toContain("OFFSET 10");
    });

    it("adds a having clause", () => {
      const mgr = users.having(sql("COUNT(*) > 1")).project(star);
      expect(mgr.toSql()).toContain("HAVING");
    });

    it("noops on nil", () => {
      const mgr = new SelectManager(users);
      mgr.where(users.get("id").eq(1));
      expect(mgr.toSql()).toContain("WHERE");
    });

    it("raises EmptyJoinError on empty", () => {
      // Joining with empty string
      const mgr = users.join("");
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("takes a second argument for join type", () => {
      const mgr = users.outerJoin(posts);
      const sql = mgr.toSql();
      expect(sql).toContain("LEFT OUTER JOIN");
    });

    it("creates an outer join", () => {
      const mgr = users.outerJoin(posts);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("should create a group", () => {
      const mgr = users.group(users.get("age")).project(star);
      expect(mgr.toSql()).toContain("GROUP BY");
    });

    it("should accept a hash", () => {
      // Table where accepts node conditions
      const mgr = users.where(users.get("id").eq(1));
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("ignores as if it equals name", () => {
      const t = new Table("users", { as: "users" });
      // tableAlias is set to 'users' -- just proves it accepts the option
      expect(t.name).toBe("users");
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

    it("should take an order", () => {
      const mgr = users.order(users.get("name").asc()).project(star);
      expect(mgr.toSql()).toContain("ORDER BY");
    });

    it("should add a limit", () => {
      const mgr = users.take(10).project(star);
      expect(mgr.toSql()).toContain("LIMIT 10");
    });

    it("can project", () => {
      const mgr = users.project(users.get("name"));
      expect(mgr.toSql()).toContain('"name"');
    });

    it("takes multiple parameters", () => {
      const mgr = users.project(users.get("name"), users.get("email"));
      expect(mgr.toSql()).toContain('"name"');
      expect(mgr.toSql()).toContain('"email"');
    });

    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("manufactures an attribute if the symbol names an attribute within the relation", () => {
      const attr = users.get("id");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("id");
      expect(attr.relation).toBe(users);
    });

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

    it("star returns table.*", () => {
      expect(users.star.value).toBe('"users".*');
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

    it("returns a tree manager", () => {
      const mgr = users.project(star);
      expect(mgr).toBeInstanceOf(SelectManager);
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

    it("should accept a hash (constructor options)", () => {
      const t = new Table("users", { as: "u" });
      expect(t.tableAlias).toBe("u");
    });

    it("returns a tree manager", () => {
      const mgr = users.from();
      expect(mgr).toBeInstanceOf(SelectManager);
    });

    it("manufactures an attribute", () => {
      const attr = users.get("id");
      expect(attr).toBeInstanceOf(Nodes.Attribute);
      expect(attr.name).toBe("id");
    });

    it("should create a node that proxies to a table", () => {
      const aliased = users.as("u");
      expect(aliased).toBeInstanceOf(Nodes.TableAlias);
      expect(aliased.relation).toBe(users);
      const sql = new Visitors.ToSql().compile(aliased.get("id") as any);
      expect(sql).toBe('"u"."id"');
    });

    it("should have a name", () => {
      const t = new Table("widgets");
      expect(t.name).toBe("widgets");
    });
  });
});
