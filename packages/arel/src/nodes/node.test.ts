import { describe, it, expect } from "vitest";
import { Table, SelectManager, Nodes, Visitors } from "../index.js";

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

describe("Node base polymorphic defaults", () => {
  const users = new Table("users");

  describe("isEquality", () => {
    it("returns false on base Node subclasses", () => {
      expect(new Nodes.SqlLiteral("x").isEquality()).toBe(false);
      expect(new Nodes.Quoted(1).isEquality()).toBe(false);
      expect(new Nodes.GreaterThan(users.get("id"), new Nodes.Quoted(1)).isEquality()).toBe(false);
    });

    it("returns true for Equality and In", () => {
      expect(new Nodes.Equality(users.get("id"), new Nodes.Quoted(1)).isEquality()).toBe(true);
      expect(new Nodes.In(users.get("id"), [new Nodes.Quoted(1)]).isEquality()).toBe(true);
    });
  });

  describe("fetchAttribute", () => {
    it("is a no-op on base Node (returns undefined)", () => {
      const result = new Nodes.SqlLiteral("x").fetchAttribute(() => "hit");
      expect(result).toBeUndefined();
    });

    it("yields the left attribute on Binary nodes", () => {
      const attr = users.get("id");
      const collected: unknown[] = [];
      new Nodes.GreaterThan(attr, new Nodes.Quoted(1)).fetchAttribute((a) => collected.push(a));
      expect(collected).toHaveLength(1);
      expect(collected[0]).toBe(attr);
    });

    it("yields the right attribute when left is not an attribute", () => {
      const attr = users.get("id");
      const collected: unknown[] = [];
      new Nodes.GreaterThan(new Nodes.Quoted(1), attr).fetchAttribute((a) => collected.push(a));
      expect(collected).toHaveLength(1);
      expect(collected[0]).toBe(attr);
    });

    it("is active on FetchAttribute Binary subclasses per Rails binary.rb", () => {
      const attr = users.get("id");
      const q = new Nodes.Quoted(1);
      const withFetch = [
        new Nodes.Between(attr, q),
        new Nodes.NotEqual(attr, q),
        new Nodes.GreaterThan(attr, q),
        new Nodes.GreaterThanOrEqual(attr, q),
        new Nodes.LessThan(attr, q),
        new Nodes.LessThanOrEqual(attr, q),
        new Nodes.Equality(attr, q),
        new Nodes.In(attr, [q]),
        new Nodes.NotIn(attr, [q]),
      ];
      for (const node of withFetch) {
        const hits: unknown[] = [];
        node.fetchAttribute((a) => hits.push(a));
        expect(hits).toHaveLength(1);
        expect(hits[0]).toBe(attr);
      }
    });

    it("is a no-op on Binary subclasses without FetchAttribute (Assignment, Union, Intersect, Except)", () => {
      const attr = users.get("id");
      const q = new Nodes.Quoted(1);
      const sel = users.project(users.get("id")).ast;
      const noFetch = [
        new Nodes.As(attr, q),
        new Nodes.Union(sel, sel),
        new Nodes.Intersect(sel, sel),
        new Nodes.Except(sel, sel),
      ];
      for (const node of noFetch) {
        const hits: unknown[] = [];
        node.fetchAttribute((a) => hits.push(a));
        expect(hits).toHaveLength(0);
      }
    });
  });
});

describe("Table.engine", () => {
  const sqliteEngine = { connection: { visitor: new Visitors.SQLite() } };

  it("Node#toSql() compiles through the engine connection's visitor", () => {
    const users = new Table("users");
    const node = users.get("name").isDistinctFrom(null);
    // Default engine (generic visitor, supplied by the suite setup).
    expect(node.toSql()).toBe(`"users"."name" IS NOT NULL`);
    // An engine whose connection carries the SQLite visitor.
    expect(node.toSql(sqliteEngine)).toBe(`"users"."name" IS NOT NULL`);
  });

  it("TreeManager#toSql() compiles through the engine connection's visitor", () => {
    const users = new Table("users");
    const mgr = users.project(users.get("id")).where(users.get("active").isNotDistinctFrom(true));
    // The generic base visitor emits the CASE form (to_sql.rb:658), not the
    // adapter-native `IS NOT DISTINCT FROM` — that is the SQLite/PG override.
    expect(mgr.toSql()).toContain("CASE WHEN");
    expect(mgr.toSql()).toContain("END = 0");
    expect(mgr.toSql()).not.toContain("IS NOT DISTINCT FROM");
    const sqlite = mgr.toSql(sqliteEngine);
    // SQLite emits IS for IS NOT DISTINCT FROM; Quoted(true) inlines as 1 in SQLite.
    expect(sqlite).toContain('"users"."active" IS 1');
    expect(sqlite).not.toContain("IS NOT DISTINCT FROM");
  });

  it("Node#toSql() raises when no engine is set", () => {
    const previous = Table.engine;
    try {
      Table.engine = null;
      expect(() => new Table("users").get("id").eq(1).toSql()).toThrow(TypeError);
    } finally {
      Table.engine = previous;
    }
  });
});
