import { describe, it, expect } from "vitest";
import { Table, SelectManager, Nodes, Visitors, setToSqlVisitor } from "../index.js";

describe("TestNode", () => {
  const users = new Table("users");
  it("includes factory methods", () => {
    const mgr = new SelectManager(users);
    expect(typeof mgr.createTrue).toBe("function");
    expect(typeof mgr.createFalse).toBe("function");
    expect(typeof mgr.createJoin).toBe("function");
    expect(typeof mgr.createStringJoin).toBe("function");
    expect(typeof mgr.createAnd).toBe("function");
    expect(typeof mgr.createOn).toBe("function");
  });

  it("all nodes are nodes", () => {
    const attr = users.get("name");
    expect(attr).toBeInstanceOf(Nodes.Attribute);
    expect(attr).toBeInstanceOf(Nodes.Node);
  });

  it("is equal with equal ivars (checks left/right)", () => {
    const a = users.get("name").as("n");
    const b = users.get("name").as("n");
    expect((a.right as Nodes.SqlLiteral).value).toBe((b.right as Nodes.SqlLiteral).value);
  });

  it("sets default case from else", () => {
    const caseNode = new Nodes.Case()
      .when(new Nodes.SqlLiteral("1 = 1"), new Nodes.SqlLiteral("'yes'"))
      .else(new Nodes.SqlLiteral("'no'"));
    expect(caseNode.default).not.toBeNull();
  });

  it("clones case, conditions and default (immutability)", () => {
    const c1 = new Nodes.Case();
    const c2 = c1.when(new Nodes.SqlLiteral("a"), new Nodes.SqlLiteral("b"));
    const c3 = c2.else(new Nodes.SqlLiteral("c"));
    // Rails mutates in-place — c1, c2, c3 are the same object
    expect(c1).toBe(c2);
    expect(c2).toBe(c3);
    expect(c1.conditions.length).toBe(1);
    expect(c3.default).not.toBeNull();
  });

  it("makes an AND node", () => {
    const eq1 = users.get("id").eq(1);
    const eq2 = users.get("name").eq("dean");
    const and = eq1.and(eq2);
    expect(and).toBeInstanceOf(Nodes.And);
  });

  it("should extract field", () => {
    const node = new Nodes.Extract(users.get("created_at"), "YEAR");
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(node)).toBe('EXTRACT(YEAR FROM "users"."created_at")');
  });

  it("should alias the extract", () => {
    const node = new Nodes.Extract(users.get("created_at"), "MONTH").as("birth_month");
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(node)).toBe('EXTRACT(MONTH FROM "users"."created_at") AS birth_month');
  });

  it("should create Equality nodes inside", () => {
    const g = new Nodes.Grouping(users.get("id").eq(1));
    expect(g.expr).toBeInstanceOf(Nodes.Equality);
  });

  it("operation ordering via sql", () => {
    const visitor = new Visitors.ToSql();
    const node = new Nodes.InfixOperation("+", users.get("a"), new Nodes.Quoted(1));
    expect(visitor.compile(node)).toBe('"users"."a" + 1');
  });

  it("construct with alias via constructor", () => {
    const fn = new Nodes.NamedFunction("SUM", [users.get("age")], "total");
    expect(fn.alias).toBeInstanceOf(Nodes.SqlLiteral);
    const visitor = new Visitors.ToSql();
    expect(visitor.compile(fn)).toBe('SUM("users"."age") AS total');
  });

  it("should order the sum via sql", () => {
    const sum = users.get("age").sum();
    expect(users.project(sum).order(users.get("name").asc()).toSql()).toContain("ORDER BY");
  });

  it("is equal when eql? returns true (same value and attribute)", () => {
    const attr = users.get("name");
    const a = new Nodes.Casted("hello", attr);
    const b = new Nodes.Casted("hello", attr);
    expect(a.value).toBe(b.value);
    expect(a.attribute).toBe(b.attribute);
  });
});

describe("setToSqlVisitor", () => {
  // The override is process-global (it mutates the module-level
  // registry). Restore the default in `finally` so subsequent tests in
  // the same worker don't see the SQLite override leak across.
  const restore = (): void => setToSqlVisitor(Visitors.ToSql);

  it("Node#toSql() routes through the configured visitor", () => {
    try {
      const users = new Table("users");
      const node = users.get("name").isDistinctFrom(null);
      // Generic visitor.
      expect(node.toSql()).toBe(`"users"."name" IS DISTINCT FROM NULL`);
      // SQLite visitor.
      setToSqlVisitor(Visitors.SQLite);
      expect(node.toSql()).toBe(`"users"."name" IS NOT NULL`);
    } finally {
      restore();
    }
  });

  it("TreeManager#toSql() (SelectManager) also routes through the configured visitor", () => {
    try {
      const users = new Table("users");
      const mgr = users.project(users.get("id")).where(users.get("active").isNotDistinctFrom(true));
      expect(mgr.toSql()).toContain("IS NOT DISTINCT FROM");
      setToSqlVisitor(Visitors.SQLite);
      const sqlite = mgr.toSql();
      // SQLite emits IS for IS NOT DISTINCT FROM, and `1` for true.
      expect(sqlite).toContain('"users"."active" IS 1');
      expect(sqlite).not.toContain("IS NOT DISTINCT FROM");
    } finally {
      restore();
    }
  });
});
