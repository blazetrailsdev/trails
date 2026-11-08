import { describe, it, expect } from "vitest";
import { postgresqlTestConnection } from "../test-helpers/connection.js";
import { Table, Nodes, Visitors, Collectors } from "../index.js";
import { Temporal } from "@blazetrails/date";

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

describe("PostgreSQL bind collection", () => {
  const users = new Table("users");

  it("compileWithBinds extracts values with $N placeholders", () => {
    const visitor = new Visitors.PostgreSQL(postgresqlTestConnection);
    const a = users.get("id").eq(new Nodes.BindParam(42));
    const b = users.get("name").eq(new Nodes.BindParam("alice"));
    const [sql, binds] = compileWithBinds(visitor, new Nodes.And([a, b]));
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).not.toContain("42");
    expect(sql).not.toContain("alice");
    expect(binds).toEqual([42, "alice"]);
  });

  it("compileWithBinds uses $N placeholders for Quoted Date values", () => {
    const visitor = new Visitors.PostgreSQL(postgresqlTestConnection);
    const d = Temporal.Instant.from("2020-01-02T12:00:00.000Z");
    const node = users.get("created_at").eq(new Nodes.Quoted(d));
    const [sql, binds] = compileWithBinds(visitor, node);
    expect(sql).toContain("2020-01-02");
    expect(sql).not.toContain("$1");
    expect(binds).toHaveLength(0);
  });
});

describe("PostgreSQL dialect overrides (audit follow-up)", () => {
  const users = new Table("users");
  const compile = (n: Nodes.Node): string =>
    new Visitors.PostgreSQL(postgresqlTestConnection).compile(n);

  it("GroupingElement renders with spaces inside parens", () => {
    const ge = new Nodes.GroupingElement([users.get("a"), users.get("b")]);
    expect(compile(ge)).toBe('( "users"."a", "users"."b" )');
  });

  it("Cube emits `CUBE( … )` with spaces", () => {
    const c = new Nodes.Cube([users.get("a"), users.get("b")]);
    expect(compile(c)).toBe('CUBE( "users"."a", "users"."b" )');
  });

  it("Rollup emits `ROLLUP( … )` with spaces", () => {
    const r = new Nodes.RollUp([users.get("a"), users.get("b")]);
    expect(compile(r)).toBe('ROLLUP( "users"."a", "users"."b" )');
  });

  it("GroupingSet emits `GROUPING SETS( … )` with spaces", () => {
    const g = new Nodes.GroupingSet([users.get("a"), users.get("b")]);
    expect(compile(g)).toBe('GROUPING SETS( "users"."a", "users"."b" )');
  });

  it("IsNotDistinctFrom uses standard SQL keyword on Postgres", () => {
    const node = users.get("a").isNotDistinctFrom(users.get("b"));
    expect(compile(node)).toBe('"users"."a" IS NOT DISTINCT FROM "users"."b"');
  });

  it("IsDistinctFrom uses standard SQL keyword on Postgres", () => {
    const node = users.get("a").isDistinctFrom(users.get("b"));
    expect(compile(node)).toBe('"users"."a" IS DISTINCT FROM "users"."b"');
  });

  it("Cube/Rollup/GroupingSet route through groupingArrayOrGroupingElement", () => {
    expect(compile(new Nodes.Cube([users.get("a"), users.get("b")]))).toBe(
      'CUBE( "users"."a", "users"."b" )',
    );
    expect(compile(new Nodes.RollUp([users.get("a")]))).toBe('ROLLUP( "users"."a" )');
    expect(compile(new Nodes.GroupingSet([users.get("a"), users.get("b")]))).toBe(
      'GROUPING SETS( "users"."a", "users"."b" )',
    );
    expect(compile(new Nodes.GroupingElement([users.get("a")]))).toBe('( "users"."a" )');
  });

  describe("Matches ESCAPE", () => {
    it("hard-quotes a string escape", () => {
      const node = users.get("name").matches("x%", "!");
      const sql = new Visitors.PostgreSQL(postgresqlTestConnection).compile(node);
      expect(sql).toContain("ESCAPE '!'");
    });

    it("visits a Node escape", () => {
      const node = users.get("name").matches("x%", new Nodes.Quoted("!"));
      const sql = new Visitors.PostgreSQL(postgresqlTestConnection).compile(node);
      expect(sql).toContain("ESCAPE '!'");
    });

    it("visits a Node escape on DoesNotMatch", () => {
      const node = users.get("name").doesNotMatch("x%", new Nodes.Quoted("!"));
      const sql = new Visitors.PostgreSQL(postgresqlTestConnection).compile(node);
      expect(sql).toContain("ESCAPE '!'");
    });
  });
});

describe("Temporal scalar quoting", () => {
  const users = new Table("users");

  it("quotes a time value as a db time", () => {
    const t = Temporal.PlainTime.from("14:23:55");
    expect(
      new Visitors.PostgreSQL(postgresqlTestConnection).compile(users.get("at").eq(t)),
    ).toContain("'14:23:55'");
  });

  it("refuses a JS Date rather than formatting it as a Time", () => {
    const d = new Date("2026-04-26T14:23:55Z");
    expect(() =>
      new Visitors.PostgreSQL(postgresqlTestConnection).compile(users.get("at").eq(d)),
    ).toThrow(TypeError);
  });
});

describe("quotedDate normalisation", () => {
  const users = new Table("users");

  it("converts a zoned value instead of emitting its wall clock", () => {
    const z = Temporal.Instant.from("2026-04-26T14:23:55Z").toZonedDateTimeISO("America/New_York");
    expect(
      new Visitors.PostgreSQL(postgresqlTestConnection).compile(users.get("at").eq(z)),
    ).toContain("'2026-04-26 14:23:55'");
  });

  it("keeps the sign on a negative year", () => {
    const d = new Temporal.PlainDate(-1, 4, 26);
    expect(
      new Visitors.PostgreSQL(postgresqlTestConnection).compile(users.get("at").eq(d)),
    ).toContain("'-1-04-26'");
  });
});
