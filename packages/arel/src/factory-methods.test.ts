import { describe, it, expect } from "vitest";
import { Table, Nodes, Visitors } from "./index.js";

describe("TestFactoryMethods", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("create join", () => {
    const join = users.createJoin(posts, users.attr("id").eq(posts.attr("user_id")));
    expect(join).toBeInstanceOf(Nodes.InnerJoin);
  });

  it("create table alias", () => {
    const aliased = users.alias("u");
    expect(aliased).toBeInstanceOf(Nodes.TableAlias);
    expect(aliased.name).toBe("u");
  });

  it("create and", () => {
    const and = users.createAnd([users.get("id").eq(1), users.get("name").eq("dean")]);
    expect(and).toBeInstanceOf(Nodes.And);
    expect(and.children.length).toBe(2);
  });

  it("create string join", () => {
    const join = users.createStringJoin("INNER JOIN posts ON posts.user_id = users.id");
    expect(join).toBeInstanceOf(Nodes.StringJoin);
  });

  it("grouping", () => {
    const g = users.grouping(users.get("id").eq(1));
    expect(g).toBeInstanceOf(Nodes.Grouping);
  });

  it("create on", () => {
    const on = users.createOn(users.attr("id").eq(posts.attr("user_id")));
    expect(on).toBeInstanceOf(Nodes.On);
  });

  it("lower", () => {
    const fn = users.lower(users.get("name"));
    expect(fn).toBeInstanceOf(Nodes.NamedFunction);
    expect(fn.name).toBe("LOWER");
  });

  it("coalesce", () => {
    const fn = users.coalesce(users.get("name"), new Nodes.Quoted("default"));
    expect(fn).toBeInstanceOf(Nodes.NamedFunction);
    expect(fn.name).toBe("COALESCE");
  });

  it("cast", () => {
    const fn = users.cast(users.get("age"), "VARCHAR");
    expect(fn).toBeInstanceOf(Nodes.NamedFunction);
    expect(fn.name).toBe("CAST");
    // Mirrors Rails: `cast` builds NamedFunction("CAST", [name.as(type)]),
    // not a string-interpolated SqlLiteral. The compiled SQL must reference
    // the column properly rather than "[object Object] AS VARCHAR".
    expect(new Visitors.ToSql().compile(fn)).toBe('CAST("users"."age" AS VARCHAR)');
  });

  it("create true", () => {
    const t = users.createTrue();
    expect(t).toBeInstanceOf(Nodes.True);
    expect(new Visitors.ToSql().compile(t)).toBe("TRUE");
  });

  it("create false", () => {
    const f = users.createFalse();
    expect(f).toBeInstanceOf(Nodes.False);
    expect(new Visitors.ToSql().compile(f)).toBe("FALSE");
  });

  // Regression: verifies the include(Node, FactoryMethods) call in index.ts
  // actually attached methods to Node.prototype. If that wiring is dropped,
  // an arbitrary Node subclass (Equality below) silently loses the API.
  describe("FactoryMethods is mixed into every Node subclass", () => {
    const eq = users.get("id").eq(1);
    it("createTrue available on Equality", () => {
      expect(eq.createTrue()).toBeInstanceOf(Nodes.True);
    });
    it("grouping available on Equality", () => {
      expect(eq.grouping(eq)).toBeInstanceOf(Nodes.Grouping);
    });
    it("createAnd available on Equality", () => {
      const and = eq.createAnd([eq, eq]);
      expect(and).toBeInstanceOf(Nodes.And);
      expect(and.children.length).toBe(2);
    });
  });
});
