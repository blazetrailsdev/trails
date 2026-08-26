import { describe, it, expect } from "vitest";
import { mysqlTestConnection } from "../test-helpers/connection.js";
import { Attribute as AMAttribute, StringType } from "@blazetrails/activemodel";
import { Table, star, SelectManager, Nodes, Visitors } from "../index.js";

describe("MySQL visitor comment emission", () => {
  const users = new Table("users");
  it("emits the SelectCore comment in MySQL output", () => {
    const mgr = new SelectManager(users).project(star()).comment("trace=mysql");
    const sql = new Visitors.MySQL(mysqlTestConnection).compile(mgr.ast);
    expect(sql).toContain("/* trace=mysql */");
  });

  it("emits the comment exactly once", () => {
    const mgr = new SelectManager(users).project(star()).comment("once");
    const sql = new Visitors.MySQL(mysqlTestConnection).compile(mgr.ast);
    expect((sql.match(/\/\* once \*\//g) ?? []).length).toBe(1);
  });
});

describe("MySQL visitor NULLS FIRST / NULLS LAST emulation", () => {
  const users = new Table("users");
  it("emulates NULLS FIRST with IS NOT NULL", () => {
    const visitor = new Visitors.MySQL(mysqlTestConnection);
    const node = users.get("id").asc().nullsFirst();
    const sql = visitor.compile(node);
    expect(sql).toContain("`users`.`id` IS NOT NULL");
    expect(sql).toContain("`users`.`id` ASC");
  });

  it("emulates NULLS LAST with IS NULL", () => {
    const visitor = new Visitors.MySQL(mysqlTestConnection);
    const node = users.get("id").asc().nullsLast();
    const sql = visitor.compile(node);
    expect(sql).toContain("`users`.`id` IS NULL");
    expect(sql).toContain("`users`.`id` ASC");
  });

  it("emulates NULLS FIRST with DESC ordering", () => {
    const visitor = new Visitors.MySQL(mysqlTestConnection);
    const node = users.get("id").desc().nullsFirst();
    const sql = visitor.compile(node);
    expect(sql).toContain("`users`.`id` IS NOT NULL");
    expect(sql).toContain("`users`.`id` DESC");
  });

  it("emulates NULLS LAST with DESC ordering", () => {
    const visitor = new Visitors.MySQL(mysqlTestConnection);
    const node = users.get("id").desc().nullsLast();
    const sql = visitor.compile(node);
    expect(sql).toContain("`users`.`id` IS NULL");
    expect(sql).toContain("`users`.`id` DESC");
  });
});

describe("MySQL dialect overrides (audit follow-up)", () => {
  const users = new Table("users");
  const compile = (n: Nodes.Node): string => new Visitors.MySQL(mysqlTestConnection).compile(n);

  it("Bin uses CAST(... AS BINARY) (mirrors Rails)", () => {
    expect(compile(new Nodes.Bin(users.get("name")))).toBe("CAST(`users`.`name` AS BINARY)");
  });

  // AbstractMysqlAdapter#case_sensitive_comparison wraps the *bind* in
  // Arel::Nodes::Bin, so the visitor has to dispatch on an
  // ActiveModel::Attribute the same way `visit` does everywhere else.
  it("Bin visits a bind attribute rather than stringifying it", () => {
    const bind = AMAttribute.fromDatabase("name", "x", new StringType());
    expect(compile(new Nodes.Bin(bind))).toBe("CAST(? AS BINARY)");
  });

  it("UnqualifiedColumn delegates to its inner expression", () => {
    expect(compile(new Nodes.UnqualifiedColumn(users.get("name")))).toBe("`users`.`name`");
  });

  it("UnqualifiedColumn renders an UPDATE SET assignment without dialect drift", () => {
    const lhs = new Nodes.UnqualifiedColumn(users.get("counter"));
    const sql = compile(new Nodes.Assignment(lhs, new Nodes.SqlLiteral("1")));
    expect(sql).toContain("`users`.`counter`");
    expect(sql).toContain("=");
    expect(sql).toContain("1");
  });

  it("IsNotDistinctFrom uses MySQL `<=>` operator", () => {
    const node = new Nodes.IsNotDistinctFrom(users.get("a"), users.get("b"));
    expect(compile(node)).toBe("`users`.`a` <=> `users`.`b`");
  });

  it("IsNotDistinctFrom handles NULL on the right (Rails: `<=> NULL`)", () => {
    const node = users.get("name").isNotDistinctFrom(null);
    expect(compile(node)).toBe("`users`.`name` <=> NULL");
  });

  it("IsDistinctFrom uses MySQL `NOT ... <=>` operator", () => {
    const node = new Nodes.IsDistinctFrom(users.get("a"), users.get("b"));
    expect(compile(node)).toBe("NOT `users`.`a` <=> `users`.`b`");
  });

  it("IsDistinctFrom handles NULL on the right (Rails: `NOT … <=> NULL`)", () => {
    const node = users.get("name").isDistinctFrom(null);
    expect(compile(node)).toBe("NOT `users`.`name` <=> NULL");
  });

  it("Regexp uses MySQL REGEXP keyword (not Postgres `~`)", () => {
    const node = new Nodes.Regexp(users.get("name"), new Nodes.SqlLiteral("'^a'"));
    expect(compile(node)).toBe("`users`.`name` REGEXP '^a'");
  });

  it("NotRegexp uses MySQL NOT REGEXP keyword", () => {
    const node = new Nodes.NotRegexp(users.get("name"), new Nodes.SqlLiteral("'^a'"));
    expect(compile(node)).toBe("`users`.`name` NOT REGEXP '^a'");
  });

  describe("prepareUpdateStatement / prepareDeleteStatement (MySQL)", () => {
    const posts = new Table("posts");
    const visitor = new Visitors.MySQL(mysqlTestConnection);
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
      expect(sql).toContain("IN (SELECT `id` FROM (SELECT DISTINCT `users`.`id` FROM `users`");
      expect(sql).toContain("INNER JOIN `posts` ON 1=1");
      expect(sql).toContain("GROUP BY `users`.`id` HAVING 1=1");
      expect(sql).toContain(") AS __active_record_temp)");
    });
  });

  it("Cte uses backtick-quoted identifiers (not double quotes)", () => {
    const inner = new SelectManager(users).project(users.get("id"));
    const cte = new Nodes.Cte("recent", inner);
    expect(compile(cte)).toMatch(/^`recent` AS \(/);
    const weird = new Nodes.Cte("we`ird", inner);
    expect(compile(weird)).toMatch(/^`we``ird` AS \(/);
  });

  it("Cte renders exactly one set of parens when relation is a Grouping (SqlLiteral path)", () => {
    const lit = new Nodes.SqlLiteral("SELECT 1");
    const cte = new Nodes.Cte("x", new Nodes.Grouping(lit));
    const sql = compile(cte);
    expect(sql).toBe("`x` AS (SELECT 1)");
    expect(sql).not.toMatch(/\(\s*\(/);
  });

  it("new MySQL() with mysqlQuoter emits backtick identifiers end-to-end", () => {
    const sql = compile(users.project(users.get("id")).ast);
    expect(sql).toContain("`users`.`id`");
    expect(sql).toContain("FROM `users`");
  });

  it("identifier with embedded backtick is doubled by mysqlDefaultQuoter", () => {
    const tbl = new Table("we`ird");
    const sql = compile(tbl.project(tbl.get("co`l")).ast);
    expect(sql).toContain("`we``ird`");
    expect(sql).toContain("`co``l`");
  });
});
