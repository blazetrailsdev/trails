/**
 * Trails-specific ToSql tests: no like-named Rails test exists in
 * arel/test/visitors/test_to_sql.rb.
 */
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  testConnection,
  mysqlTestConnection,
  fakeRecordConnection,
} from "../test-helpers/connection.js";
import * as Nodes from "../nodes/index.js";
import * as Visitors from "./index.js";
import * as Collectors from "../collectors/index.js";
import { Table } from "../table.js";
import { star } from "../index.js";
import { UpdateManager } from "../update-manager.js";
import { DeleteManager } from "../delete-manager.js";

const users = new Table("users");

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

describe("ToSql Array-named identifiers", () => {
  type ToSqlInternals = { quoteColumnName(name: string | Nodes.SqlLiteral): string };
  const make = (): ToSqlInternals =>
    new Visitors.ToSql(testConnection) as unknown as ToSqlInternals;

  // Rails' adapters stringify with `name.to_s`, and Ruby's `Array#to_s` is
  // inspect-style rather than JS's comma-join. An Array-named Attribute shows
  // up on the composite-primary-key default order path; the reference is
  // invalid SQL in Rails too, so the point is byte-identical output.
  it("quoteColumnName stringifies an Array name like Ruby's Array#to_s", () => {
    const v = make();
    const name = ["shop_id", "id"] as unknown as string;
    expect(v.quoteColumnName(name)).toBe('"[""shop_id"", ""id""]"');
  });

  it("an Array-named attribute compiles to Rails' Array#to_s column reference", () => {
    const orders = new Table("cpk_orders");
    const attr = orders.get(["shop_id", "id"] as unknown as string);
    expect(new Visitors.ToSql(testConnection).compile(new Nodes.Descending(attr))).toBe(
      '"cpk_orders"."[""shop_id"", ""id""]" DESC',
    );
  });

  // Ruby's Array#to_s inspects each element, so String#inspect escaping applies:
  // named escapes for the usual control characters, \uXXXX (uppercase, four
  // digits) for other non-printables, `\#` only where a `#` would begin an
  // interpolation, and printable non-ASCII passed through. The expectation is
  // the verbatim output of running these same inputs through
  // `ruby -e 'puts cases.to_s'`.
  it("quoteColumnName applies Ruby String#inspect escaping to Array elements", () => {
    const names = [
      "a\n",
      "t\tb",
      "esc\u001b",
      "nul\u0000",
      "del\u007f",
      "u\u00e9",
      "bs\\",
      'q"',
      "cr\r",
      "ff\f",
      "vt\u000b",
      "bel\u0007",
      "bsp\b",
      "h#{x}",
      "d#$g",
      "a#@i",
      "plain#hash",
      "shop_id",
      "id",
      "\u0001\u001f",
      "\u65e5\u672c",
    ] as unknown as string;

    const quoted = make().quoteColumnName(names);
    expect(quoted.slice(1, -1).replaceAll('""', '"')).toBe(
      String.raw`["a\n", "t\tb", "esc\e", "nul\u0000", "del\u007F", "ué", "bs\\", "q\"", "cr\r", "ff\f", "vt\v", "bel\a", "bsp\b", "h\#{x}", "d\#$g", "a\#@i", "plain#hash", "shop_id", "id", "\u0001\u001F", "日本"]`,
    );
  });

  // Rails' MySQL visitor renders a CTE name with the visitor's own
  // `quote_table_name` (arel/visitors/mysql.rb:73 → to_sql.rb:872), not the
  // connection's, so the name goes through the same Array#to_s stand-in.
  it("the MySQL CTE visitor routes its name through the ToSql quoteTableName helper", () => {
    const cte = new Nodes.Cte(
      ["a", "b"] as unknown as string,
      new Table("t").from().project(new Nodes.SqlLiteral("1")),
    );
    expect(new Visitors.MySQL(mysqlTestConnection).compile(cte)).toContain('`["a", "b"]` AS ');
  });
});

describe("ToSql raw scalars in quoting slots", () => {
  const users = new Table("users");

  // Regression guard for the `NodeOrValue` union. Rails' Assignment visitor
  // `case`s on the value and sends anything that is not a Node/Attribute to
  // `quote(o.right)` rather than `visit` (to_sql.rb:637-639). That is why a
  // bare boolean renders here even though `visit_TrueClass`/`visit_FalseClass`
  // are aliased to `unsupported` (to_sql.rb:845, :838) — the alias governs
  // direct dispatch, which this slot never reaches. Dropping `boolean` from the
  // union on the strength of that alias alone would contradict this behaviour.
  it("quotes a bare boolean in an Assignment right instead of raising", () => {
    const node = new Nodes.Assignment(users.get("admin"), true);
    expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"users"."admin" = TRUE');
  });

  it("quotes a bare string in an Assignment right instead of raising", () => {
    const node = new Nodes.Assignment(users.get("name"), "x");
    expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"users"."name" = \'x\'');
  });
});

describe("ToSql grouping-set nodes are PostgreSQL-only", () => {
  const users = new Table("users");
  const compile = (n: Nodes.Node): string => new Visitors.ToSql(testConnection).compile(n);

  // `visit_Arel_Nodes_Cube` / `RollUp` / `GroupingElement` / `GroupingSet` are
  // defined only on the PostgreSQL visitor (postgresql.rb:44-62); the base
  // ToSql has no handler, so each falls out of `Visitor#visit`'s TypeError
  // terminal (visitor.rb:36-39).
  it("raises rather than emitting SQL for Cube/RollUp/GroupingElement/GroupingSet", () => {
    expect(() => compile(new Nodes.Cube([users.get("a")]))).toThrow(TypeError);
    expect(() => compile(new Nodes.RollUp([users.get("a")]))).toThrow(TypeError);
    expect(() => compile(new Nodes.GroupingElement([users.get("a")]))).toThrow(TypeError);
    expect(() => compile(new Nodes.GroupingSet([users.get("a")]))).toThrow(TypeError);
  });
});

describe("ToSql build_quoted Table arm", () => {
  const users = new Table("users");
  const posts = new Table("posts");

  // casted.rb:47-51 passes an `Arel::Table` through unchanged, so
  // `visit_Arel_Table` renders it rather than `Quoted` quoting it as a value.
  it("renders a Table reached through quotedNode as a table reference", () => {
    const node = users.get("id").eq(posts);
    expect(new Visitors.ToSql(testConnection).compile(node)).toBe('"users"."id" = "posts"');
  });
});

describe("Quoted/Casted collapse", () => {
  it("Quoted inlines via quote(valueForDatabase) when not extracting binds", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    expect(visitor.compile(new Nodes.Quoted("hi"))).toBe("'hi'");
  });

  it("Quoted Temporal.Instant binds through unified addBind path under extractBinds", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    const instant = Temporal.Instant.from("2026-04-30T12:34:56.000Z");
    const [sql, binds] = compileWithBinds(visitor, new Nodes.Quoted(instant));
    expect(sql).toContain("2026-04-30");
    expect(sql).not.toContain("?");
    expect(binds).toHaveLength(0);
  });

  it("Quoted non-Date inlines under extractBinds=false", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    expect(visitor.compile(new Nodes.Quoted(42))).toBe("42");
  });

  it("Quoted string binds raw under extractBinds", () => {
    const [sql, binds] = compileWithBinds(
      new Visitors.ToSql(fakeRecordConnection),
      new Nodes.Quoted("hi"),
    );
    expect(sql).toBe("'hi'");
    expect(binds).toHaveLength(0);
  });

  it("Quoted number binds raw under extractBinds", () => {
    const [sql, binds] = compileWithBinds(
      new Visitors.ToSql(fakeRecordConnection),
      new Nodes.Quoted(42),
    );
    expect(sql).toBe("42");
    expect(binds).toHaveLength(0);
  });

  // Trails-only: asserts the adapter's `quoted_date` rendering (fake_record.rb:73-76).
  it("Quoted toISOString-bearing object binds raw under extractBinds", () => {
    const value = Temporal.Instant.from("2026-04-30T00:00:00.000Z");
    const [sql, binds] = compileWithBinds(
      new Visitors.ToSql(testConnection),
      new Nodes.Quoted(value),
    );
    expect(sql).toBe("'2026-04-30 00:00:00'");
    expect(binds).toHaveLength(0);
  });
});

describe("Nodes::Lock", () => {
  it("visits the inner expr (no FOR UPDATE fallback)", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.Lock(new Nodes.SqlLiteral("FOR SHARE"));
    expect(visitor.compile(node)).toBe("FOR SHARE");
  });

  it("SelectManager#lock wraps default in SqlLiteral", () => {
    expect(users.project(star()).lock().toSql()).toBe('SELECT * FROM "users" FOR UPDATE');
  });

  it("SelectManager#lock with custom string wraps in SqlLiteral", () => {
    expect(users.project(star()).lock("FOR SHARE").toSql()).toBe('SELECT * FROM "users" FOR SHARE');
  });
});

describe("OuterJoin guard", () => {
  it("OuterJoin without an ON throws", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.OuterJoin(users, null);
    expect(() => visitor.compile(node)).toThrow();
  });

  it("RightOuterJoin without an ON throws", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.RightOuterJoin(users, null);
    expect(() => visitor.compile(node)).toThrow();
  });

  it("FullOuterJoin without an ON throws", () => {
    const visitor = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.FullOuterJoin(users, null);
    expect(() => visitor.compile(node)).toThrow();
  });
});

describe("Table with Node name", () => {
  it("visits the Node when name is an Arel Node", () => {
    const tbl = new Table("ignored");
    (tbl as unknown as { name: Nodes.Node }).name = new Nodes.SqlLiteral("my_subq");
    expect(new Visitors.ToSql(fakeRecordConnection).compile(tbl)).toBe("my_subq");
  });
});

describe("UpdateManager subselect", () => {
  it("renders WHERE pk IN (SELECT pk ...) when limit is present", () => {
    const um = new UpdateManager();
    um.table(users);
    um.set([[users.get("name"), "x"]]);
    um.take(1);
    um.key = users.get("id");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(um.ast);
    expect(sql).toContain('IN (SELECT "users"."id"');
  });
});

describe("DeleteManager subselect", () => {
  it("renders WHERE pk IN (SELECT pk ...) when limit is present", () => {
    const dm = new DeleteManager();
    dm.from(users);
    dm.take(1);
    dm.key = users.get("id");
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(dm.ast);
    expect(sql).toContain('IN (SELECT "users"."id"');
  });
});

describe("ArelQuoter / defaultQuoter wiring", () => {
  // Trails-only: this block exercises `defaultQuoter` — the adapter quoting —
  // rather than the FakeRecord double of fake_record.rb:55-90, so every visitor
  // here, the `RecordingToSql` subclasses at the end included, keeps
  // `testConnection`.
  const users = new Table("users");

  it("default quoter emits double-quoted identifiers", () => {
    const sql = new Visitors.ToSql(testConnection).compile(users.get("id").eq(1));
    expect(sql).toContain('"users"."id"');
  });

  it("default quoter: schema-qualified name is split and each part double-quoted", () => {
    const t = new Table("test_schema.things");
    const sql = new Visitors.ToSql(testConnection).compile(t.project(t.get(star())).ast);
    expect(sql).toContain('"test_schema"."things".*');
    expect(sql).toContain('FROM "test_schema"."things"');
  });

  it("stub quoter: quoteTableName output appears in compiled SQL", () => {
    const stubQuoter: Visitors.ArelConnection = {
      quoteTableName: (name) => `<<${name}>>`,
      quoteColumnName: (name) => `<<${name}>>`,
      quoteString: (s) => s.replace(/'/g, "''"),
      quote: (v) => (v === null ? "NULL" : `'${v}'`),
      quotedBinary: (v) => `'${v}'`,
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v) => v,
      castBoundValue: (v) => v,
    };
    const sql = new Visitors.ToSql(stubQuoter).compile(users.get("id").eq(1));
    expect(sql).toContain("<<users>>");
  });

  it("Uint8Array in value position is routed through quoter.quote(), not String()", () => {
    // Guards against the String(Uint8Array) → comma-joined decimals ('31,139')
    // corruption path. The visitor hands the raw value to `connection.quote`
    // (to_sql.rb:867-870); the connection dispatches binary to quotedBinary and
    // emits the correct dialect binary literal.
    const received: unknown[] = [];
    const stubQuoter: Visitors.ArelConnection = {
      quoteTableName: (name) => `"${name}"`,
      quoteColumnName: (name) => `"${name}"`,
      quoteString: (s) => s.replace(/'/g, "''"),
      quote: (v) => (v instanceof Uint8Array ? stubQuoter.quotedBinary(v) : `'${v}'`),
      quotedBinary: (v) => {
        received.push(v);
        return v instanceof Uint8Array ? `'\\x${Buffer.from(v).toString("hex")}'` : `'${v}'`;
      },
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v) => v,
      castBoundValue: (v) => v,
    };
    const bytes = new Uint8Array([0x1f, 0x8b]);
    const node = users.get("payload").eq(bytes);
    new Visitors.ToSql(stubQuoter).compile(node);
    expect(received).toContain(bytes);
  });

  it("integers in raw value position bypass quote(), matching Rails visit_Integer", () => {
    // Rails' raw-value dispatch sends an Integer to `visit_Integer`, which is
    // `collector << o.to_s` (to_sql.rb:824-826) — the connection is never
    // consulted. `quote` governs the Casted-node path (to_sql.rb:87-90), not
    // this one. A quoter that mangles everything must therefore not be able to
    // reach an integer here.
    const quoted: unknown[] = [];
    class RecordingToSql extends Visitors.ToSql {
      protected override quote(value: unknown): string {
        quoted.push(value);
        return `<<${String(value)}>>`;
      }
    }
    // A raw JS number reaches the visitor only when placed directly into a
    // node; `.in([1, 2])` instead wraps each value in a Casted node via
    // `quotedNode`, which is the to_sql.rb:87-90 path and does route through
    // quote(). InfixOperation carries the raw value through unwrapped.
    const sql = new RecordingToSql(testConnection).compile(
      new Nodes.InfixOperation(
        "+",
        new Nodes.InfixOperation("+", users.get("id"), 1),
        9007199254740993n,
      ),
    );
    expect(quoted).toEqual([]);
    expect(sql).toContain("+ 1");
    expect(sql).toContain("+ 9007199254740993");
  });

  it("Casted values do route through quote(), unlike raw integers", () => {
    // The companion to the guard above: to_sql.rb:87-90 sends a Casted /
    // Quoted node's value through quote(), so the two paths must differ.
    const quoted: unknown[] = [];
    class RecordingToSql extends Visitors.ToSql {
      protected override quote(value: unknown): string {
        quoted.push(value);
        return super.quote(value);
      }
    }
    new RecordingToSql(testConnection).compile(users.get("id").in([1, 2]));
    expect(quoted).toEqual([1, 2]);
  });
});
