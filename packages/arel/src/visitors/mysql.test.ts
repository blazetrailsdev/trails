import { describe, it, expect } from "vitest";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("MysqlTest", () => {
  const users = new Table("users");
  const posts = new Table("posts");
  it("should escape LIMIT", () => {
    const mgr = users.project(star).take(10);
    expect(mgr.toSql()).toContain("LIMIT 10");
  });

  describe("Nodes::Regexp", () => {
    it("should know how to visit", () => {
      const node = users.get("name").matchesRegexp("bar");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.left).toHaveProperty("name", "name");
    });

    it("can handle subqueries", () => {
      const node = users.get("name").matchesRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.Regexp);
      expect(node.left).toHaveProperty("name", "name");
    });
  });

  describe("Nodes::NotRegexp", () => {
    it("can handle subqueries", () => {
      const node = users.get("name").doesNotMatchRegexp("foo.*");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(node.left).toHaveProperty("name", "name");
    });

    it("should know how to visit", () => {
      const node = users.get("name").doesNotMatchRegexp("bar");
      expect(node).toBeInstanceOf(Nodes.NotRegexp);
      expect(node.left).toHaveProperty("name", "name");
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle nil", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("name").isDistinctFrom(null);
      expect(visitor.compile(node)).toContain("IS DISTINCT FROM");
    });
  });

  describe("Nodes::Ordering", () => {
    it("should handle nulls first", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsFirst();
      expect(visitor.compile(node)).toContain("NULLS FIRST");
    });

    it("should handle nulls last", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsLast();
      expect(visitor.compile(node)).toContain("NULLS LAST");
    });

    it("should handle nulls first reversed", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsLast().reverse();
      expect(visitor.compile(node)).toContain("NULLS FIRST");
    });

    it("should handle nulls last reversed", () => {
      const visitor = new Visitors.ToSql();
      const node = users.get("id").asc().nullsFirst().reverse();
      expect(visitor.compile(node)).toContain("NULLS LAST");
    });
  });

  describe("Nodes::NullsFirst / NullsLast (MySQL emulation)", () => {
    it("emulates NULLS FIRST with IS NOT NULL", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").asc().nullsFirst();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NOT NULL');
      expect(sql).toContain('"users"."id" ASC');
    });

    it("emulates NULLS LAST with IS NULL", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").asc().nullsLast();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NULL');
      expect(sql).toContain('"users"."id" ASC');
    });

    it("emulates NULLS FIRST with DESC ordering", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").desc().nullsFirst();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NOT NULL');
      expect(sql).toContain('"users"."id" DESC');
    });

    it("emulates NULLS LAST with DESC ordering", () => {
      const visitor = new Visitors.MySQL();
      const node = users.get("id").desc().nullsLast();
      const sql = visitor.compile(node);
      expect(sql).toContain('"users"."id" IS NULL');
      expect(sql).toContain('"users"."id" DESC');
    });
  });

  it("defaults limit to 18446744073709551615", () => {
    const mgr = users.project(star).skip(5);
    const sql = new Visitors.MySQL().compile(mgr.ast);
    expect(sql).toContain("LIMIT 18446744073709551615");
    expect(sql).toContain("OFFSET 5");
  });

  it("uses DUAL for empty from", () => {
    const mgr = new SelectManager();
    mgr.project("1");
    const sql = new Visitors.MySQL().compile(mgr.ast);
    expect(sql).toContain("FROM DUAL");
  });

  describe("locking", () => {
    it("defaults to FOR UPDATE when locking", () => {
      const mgr = users.project(star).lock();
      const sql = new Visitors.MySQL().compile(mgr.ast);
      expect(sql).toContain("FOR UPDATE");
    });

    it("allows a custom string to be used as a lock", () => {
      const mgr = users.project(star).lock("LOCK IN SHARE MODE");
      const sql = new Visitors.MySQL().compile(mgr.ast);
      expect(sql).toContain("LOCK IN SHARE MODE");
    });
  });

  describe("concat", () => {
    it("concats columns", () => {
      const node = new Nodes.Concat(users.get("name"), users.get("email"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toBe('CONCAT("users"."name", "users"."email")');
    });

    it("concats a string", () => {
      const node = new Nodes.Concat(users.get("name"), new Nodes.Quoted("x"));
      const sql = new Visitors.MySQL().compile(node);
      expect(sql).toBe('CONCAT("users"."name", \'x\')');
    });
  });

  // MySQL renders IS [NOT] DISTINCT FROM via the `<=>` null-safe equality
  // operator (Rails arel/visitors/mysql.rb). The standard
  // `IS [NOT] DISTINCT FROM` form is only supported on MySQL 8.0.14+;
  // the operator form works on every supported MySQL version.
  describe("Nodes::IsNotDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isNotDistinctFrom(posts.get("user_id"));
      expect(new Visitors.MySQL().compile(node)).toBe('"users"."id" <=> "posts"."user_id"');
    });

    it("should handle nil", () => {
      const node = users.get("name").isNotDistinctFrom(null);
      expect(new Visitors.MySQL().compile(node)).toBe('"users"."name" <=> NULL');
    });

    it("should construct a valid generic SQL statement", () => {
      const node = users.get("name").isNotDistinctFrom(new Nodes.Quoted(1));
      expect(new Visitors.MySQL().compile(node)).toBe('"users"."name" <=> 1');
    });
  });

  describe("Nodes::IsDistinctFrom", () => {
    it("should handle column names on both sides", () => {
      const node = users.get("id").isDistinctFrom(posts.get("user_id"));
      expect(new Visitors.MySQL().compile(node)).toBe('NOT "users"."id" <=> "posts"."user_id"');
    });
  });

  describe("Nodes::Cte", () => {
    it("ignores MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "materialized");
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.MySQL().compile(stmt.ast);
      expect(sql).not.toContain("MATERIALIZED");
    });

    it("ignores NOT MATERIALIZED modifiers", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")).ast, "not_materialized");
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.MySQL().compile(stmt.ast);
      expect(sql).not.toContain("NOT MATERIALIZED");
    });
  });
});

// Audit follow-up: verify the MySQL dialect overrides land on the
// previously-missing visit methods (Bin / UnqualifiedColumn /
// IsDistinctFrom / IsNotDistinctFrom / Regexp / NotRegexp / Cte).
describe("MySQL dialect overrides (audit follow-up)", () => {
  const users = new Table("users");
  const compile = (n: Nodes.Node): string => new Visitors.MySQL().compile(n);

  it("Bin uses CAST(... AS BINARY) (mirrors Rails)", () => {
    expect(compile(new Nodes.Bin(users.get("name")))).toBe('CAST("users"."name" AS BINARY)');
  });

  it("UnqualifiedColumn delegates to its inner expression", () => {
    expect(compile(new Nodes.UnqualifiedColumn(users.get("name")))).toBe('"users"."name"');
  });

  it("UnqualifiedColumn renders an UPDATE SET assignment without dialect drift", () => {
    // The override exists so `UPDATE t SET col = col + 1` works on
    // MySQL — the LHS of the assignment must compile cleanly through
    // the inner Attribute. Regression coverage: any future change to
    // visitUnqualifiedColumn that throws or short-circuits would
    // break this end-to-end shape.
    const lhs = new Nodes.UnqualifiedColumn(users.get("counter"));
    const sql = compile(new Nodes.Assignment(lhs, new Nodes.SqlLiteral("1")));
    expect(sql).toContain('"users"."counter"');
    expect(sql).toContain("=");
    expect(sql).toContain("1");
  });

  it("IsNotDistinctFrom uses MySQL `<=>` operator", () => {
    const node = new Nodes.IsNotDistinctFrom(users.get("a"), users.get("b"));
    expect(compile(node)).toBe('"users"."a" <=> "users"."b"');
  });

  it("IsNotDistinctFrom handles NULL on the right (Rails: `<=> NULL`)", () => {
    const node = users.get("name").isNotDistinctFrom(null);
    expect(compile(node)).toBe('"users"."name" <=> NULL');
  });

  it("IsDistinctFrom uses MySQL `NOT ... <=>` operator", () => {
    const node = new Nodes.IsDistinctFrom(users.get("a"), users.get("b"));
    expect(compile(node)).toBe('NOT "users"."a" <=> "users"."b"');
  });

  it("IsDistinctFrom handles NULL on the right (Rails: `NOT … <=> NULL`)", () => {
    const node = users.get("name").isDistinctFrom(null);
    expect(compile(node)).toBe('NOT "users"."name" <=> NULL');
  });

  it("Regexp uses MySQL REGEXP keyword (not Postgres `~`)", () => {
    const node = new Nodes.Regexp(users.get("name"), new Nodes.SqlLiteral("'^a'"));
    expect(compile(node)).toBe('"users"."name" REGEXP \'^a\'');
  });

  it("NotRegexp uses MySQL NOT REGEXP keyword", () => {
    const node = new Nodes.NotRegexp(users.get("name"), new Nodes.SqlLiteral("'^a'"));
    expect(compile(node)).toBe('"users"."name" NOT REGEXP \'^a\'');
  });

  describe("prepareUpdateStatement / prepareDeleteStatement (MySQL)", () => {
    const posts = new Table("posts");
    const visitor = new Visitors.MySQL();
    type WithPrepare = {
      prepareUpdateStatement(o: Nodes.UpdateStatement): Nodes.UpdateStatement;
      prepareDeleteStatement(o: Nodes.DeleteStatement): Nodes.DeleteStatement;
    };
    const prep = visitor as unknown as WithPrepare;

    const buildUpdate = (opts: {
      withJoin?: boolean;
      limit?: boolean;
      offset?: boolean;
      orders?: boolean;
      groups?: boolean;
      havings?: boolean;
    }): Nodes.UpdateStatement => {
      const stmt = new Nodes.UpdateStatement();
      const relation = opts.withJoin
        ? new Nodes.JoinSource(users, [
            new Nodes.InnerJoin(posts, new Nodes.On(new Nodes.SqlLiteral("1=1"))),
          ])
        : new Nodes.JoinSource(users);
      stmt.relation = relation;
      stmt.key = users.get("id");
      if (opts.limit) stmt.limit = new Nodes.Limit(new Nodes.SqlLiteral("1"));
      if (opts.offset) stmt.offset = new Nodes.Offset(new Nodes.SqlLiteral("1"));
      if (opts.orders) stmt.orders = [users.get("id")];
      if (opts.groups) stmt.groups = [users.get("id")];
      if (opts.havings) stmt.havings = [new Nodes.SqlLiteral("1=1")];
      return stmt;
    };

    it("UPDATE with JOIN but no LIMIT/OFFSET/ORDER returns the original statement (no subselect)", () => {
      const stmt = buildUpdate({ withJoin: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).toBe(stmt);
    });

    it("UPDATE without JOIN and without OFFSET returns original even with LIMIT/ORDER", () => {
      const stmt = buildUpdate({ limit: true, orders: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).toBe(stmt);
    });

    it("UPDATE with JOIN + LIMIT triggers subselect rewrite", () => {
      const stmt = buildUpdate({ withJoin: true, limit: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).not.toBe(stmt);
      expect(out.wheres.length).toBe(1);
      expect(out.wheres[0]).toBeInstanceOf(Nodes.In);
    });

    it("UPDATE with OFFSET (no JOIN) triggers subselect rewrite", () => {
      const stmt = buildUpdate({ offset: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).not.toBe(stmt);
    });

    it("UPDATE with JOIN + GROUP BY + HAVING triggers subselect rewrite", () => {
      const stmt = buildUpdate({ withJoin: true, groups: true, havings: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).not.toBe(stmt);
    });

    it("UPDATE with GROUP BY only (no HAVING) does NOT trigger rewrite", () => {
      const stmt = buildUpdate({ groups: true });
      const out = prep.prepareUpdateStatement(stmt);
      expect(out).toBe(stmt);
    });

    it("DELETE follows the same rules (alias of prepareUpdateStatement)", () => {
      const stmt = new Nodes.DeleteStatement(
        new Nodes.JoinSource(users, [
          new Nodes.InnerJoin(posts, new Nodes.On(new Nodes.SqlLiteral("1=1"))),
        ]),
      );
      stmt.key = users.get("id");
      stmt.limit = new Nodes.Limit(new Nodes.SqlLiteral("1"));
      const out = prep.prepareDeleteStatement(stmt);
      expect(out).not.toBe(stmt);
      expect(out.wheres[0]).toBeInstanceOf(Nodes.In);
    });

    it("buildSubselect adds DISTINCT when the subselect has no LIMIT/OFFSET/ORDER", () => {
      // JOIN + GROUP BY + HAVING (no LIMIT/OFFSET/ORDER): super clones
      // and clears limit/offset/orders on the rewritten stmt, build_subselect
      // sees an `o` with none of those → MySQL adds DISTINCT to materialize.
      const stmt = buildUpdate({ withJoin: true, groups: true, havings: true });
      const out = prep.prepareUpdateStatement(stmt);
      const sql = visitor.compile(out);
      expect(sql).toContain("__active_record_temp");
      expect(sql).toContain("DISTINCT");
    });

    it("buildSubselect skips DISTINCT when subselect already carries LIMIT", () => {
      const stmt = buildUpdate({ withJoin: true, limit: true });
      const out = prep.prepareUpdateStatement(stmt);
      const sql = visitor.compile(out);
      expect(sql).toContain("__active_record_temp");
      expect(sql).not.toContain("DISTINCT");
    });

    // Full-shape regression for the JOIN+GROUP+HAVING path: pins the
    // exact subselect wrapping (DISTINCT, `__active_record_temp` alias,
    // outer projection of the quoted key column) so any future
    // visitor change that drifts from Rails will be caught here.
    it("JOIN + GROUP BY + HAVING produces the full Rails-shaped subselect", () => {
      const stmt = buildUpdate({ withJoin: true, groups: true, havings: true });
      const out = prep.prepareUpdateStatement(stmt);
      const sql = visitor.compile(out);
      expect(sql).toContain('IN (SELECT "id" FROM (SELECT DISTINCT "users"."id" FROM "users"');
      expect(sql).toContain('INNER JOIN "posts" ON 1=1');
      expect(sql).toContain('GROUP BY "users"."id" HAVING 1=1');
      expect(sql).toContain(") AS __active_record_temp)");
    });
  });

  it("Cte uses backtick-quoted identifiers (not double quotes)", () => {
    const inner = new SelectManager(users).project(users.get("id"));
    const cte = new Nodes.Cte("recent", inner.ast);
    expect(compile(cte)).toMatch(/^`recent` AS \(/);
    // Embedded backticks must be doubled.
    const weird = new Nodes.Cte("we`ird", inner.ast);
    expect(compile(weird)).toMatch(/^`we``ird` AS \(/);
  });
});
