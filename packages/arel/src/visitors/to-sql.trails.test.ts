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
import { star, InsertManager, SelectManager } from "../index.js";
import { UpdateManager } from "../update-manager.js";
import { DeleteManager } from "../delete-manager.js";
import { mustBeLike } from "../test-helpers/must-be-like.js";
import { StringType, Attribute as AMAttribute, ValueType } from "@blazetrails/activemodel";

const users = new Table("users");

function compileWithBinds(visitor: Visitors.ToSql, node: unknown): [string, unknown[]] {
  const collector = new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
  return visitor.compile(node as never, collector) as [string, unknown[]];
}

describe("ToSql Array-named identifiers", () => {
  type ToSqlInternals = { quoteColumnName(name: string | Nodes.SqlLiteral): string };
  const make = (): ToSqlInternals =>
    new Visitors.ToSql(testConnection) as unknown as ToSqlInternals;

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
    const quoted: unknown[] = [];
    class RecordingToSql extends Visitors.ToSql {
      protected override quote(value: unknown): string {
        quoted.push(value);
        return `<<${String(value)}>>`;
      }
    }
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

describe("the to_sql visitor", () => {
  const users = new Table("users");
  describe("unboundable values in IN / NOT IN lists", () => {
    const unboundable = new Nodes.BindParam({ isUnboundable: () => 1 as const });

    it("drops an unboundable value from an IN list", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("id").in([1, unboundable]),
      );
      expect(sql).toBe('"users"."id" IN (1)');
    });

    it("collapses an all-unboundable IN list to 1=0", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("id").in([unboundable, unboundable]),
      );
      expect(sql).toBe("1=0");
    });

    it("drops an unboundable value from a NOT IN list", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("id").notIn([1, unboundable]),
      );
      expect(sql).toBe('"users"."id" NOT IN (1)');
    });

    it("collapses an all-unboundable NOT IN list to 1=1", () => {
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(
        users.get("id").notIn([unboundable, unboundable]),
      );
      expect(sql).toBe("1=1");
    });
  });

  describe("Nodes::Between", () => {
    const compileNode = (n: Nodes.Node): string =>
      new Visitors.ToSql(fakeRecordConnection).compile(n);

    it("can handle two dot ranges", () => {
      const node = users.get("id").between({ begin: 1, end: 3 });
      expect(mustBeLike(compileNode(node))).toBe(mustBeLike('"users"."id" BETWEEN 1 AND 3'));
    });

    it("can handle three dot ranges", () => {
      const node = users.get("id").between({ begin: 1, end: 3, excludeEnd: true });
      expect(mustBeLike(compileNode(node))).toBe(
        mustBeLike('"users"."id" >= 1 AND "users"."id" < 3'),
      );
    });

    it("can handle ranges bounded by infinity", () => {
      let node = users.get("id").between({ begin: 1, end: Infinity });
      expect(mustBeLike(compileNode(node))).toBe(mustBeLike('"users"."id" >= 1'));
      node = users.get("id").between({ begin: -Infinity, end: 3 });
      expect(mustBeLike(compileNode(node))).toBe(mustBeLike('"users"."id" <= 3'));
      node = users.get("id").between({ begin: -Infinity, end: 3, excludeEnd: true });
      expect(mustBeLike(compileNode(node))).toBe(mustBeLike('"users"."id" < 3'));
      node = users.get("id").between({ begin: -Infinity, end: Infinity });
      expect(mustBeLike(compileNode(node))).toBe(mustBeLike("1=1"));
    });
  });

  it("renders non-finite numbers bare in a ValuesList, matching the abstract adapter", () => {
    const mgr = new InsertManager(users);
    mgr.insert([[users.get("name"), Number.POSITIVE_INFINITY]]);
    expect(mgr.toSql()).toContain("VALUES (Infinity)");
    const mgr2 = new InsertManager(users);
    mgr2.insert([[users.get("name"), Number.NEGATIVE_INFINITY]]);
    expect(mgr2.toSql()).toContain("VALUES (-Infinity)");
    const mgr3 = new InsertManager(users);
    mgr3.insert([[users.get("name"), Number.NaN]]);
    expect(mgr3.toSql()).toContain("VALUES (NaN)");
  });

  describe("Nodes::Cte", () => {
    it("handles CTEs with null materialized (tristate nil — no modifier)", () => {
      const cte = new Nodes.Cte("t", users.project(users.get("id")), null);
      const stmt = new SelectManager().with(cte).project("1");
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(stmt.ast);
      expect(sql).not.toContain("MATERIALIZED");
    });

    it("does not double-wrap a Grouping body (SqlLiteral path)", () => {
      const cte = new Nodes.Cte("t", new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 1")));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(cte);
      expect(sql).toBe('"t" AS (SELECT 1)');
    });

    it("does not double-wrap a UnionAll body (array CTE path)", () => {
      const union = new Nodes.UnionAll(
        new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 1")),
        new Nodes.Grouping(new Nodes.SqlLiteral("SELECT 2")),
      );
      const cte = new Nodes.Cte("t", union);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(cte);
      expect(sql).toBe('"t" AS ( (SELECT 1) UNION ALL (SELECT 2) )');
    });
  });

  describe("Nodes::NotIn", () => {
    it("is not preparable when an array", () => {
      const node = users.get("id").notIn([1, 2, 3]);
      const collector = new Collectors.SQLString();
      new Visitors.ToSql(fakeRecordConnection).accept(node, collector);
      expect(collector.preparable).toBe(false);
    });
  });

  describe("Nodes::Fragments", () => {
    it("interleaves a space between values", () => {
      const node = new Nodes.Fragments([new Nodes.SqlLiteral("foo"), new Nodes.SqlLiteral("bar")]);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("foo bar");
    });
  });

  describe("Nodes::HomogeneousIn", () => {
    it("is not preparable", () => {
      const castedUsers = new Table("users", {
        typeCaster: { typeForAttribute: () => new StringType() },
      });
      const node = new Nodes.HomogeneousIn([1, 2, 3], castedUsers.get("id"), "in");
      const collector = new Collectors.SQLString();
      new Visitors.ToSql(fakeRecordConnection).accept(node, collector);
      expect(collector.preparable).toBe(false);
    });
  });

  describe("value-class visitors aliased to unsupported", () => {
    const aliasNames = [
      "visitActiveSupportMultibyteChars",
      "visitActiveSupportStringInquirer",
      "visitBigDecimal",
      "visitClass",
      "visitDate",
      "visitDateTime",
      "visitFalseClass",
      "visitFloat",
      "visitHash",
      "visitNilClass",
      "visitString",
      "visitSymbol",
      "visitTime",
      "visitTrueClass",
    ] as const;

    for (const name of aliasNames) {
      it(`${name} raises UnsupportedVisitError`, () => {
        const v = new Visitors.ToSql(fakeRecordConnection);
        const fn = (v as unknown as Record<string, (o: unknown, c: unknown) => never>)[name];
        const node = new Nodes.SqlLiteral("x");
        const collector = new Collectors.SQLString();
        expect(() => fn.call(v, node, collector)).toThrow(Visitors.UnsupportedVisitError);
      });
    }
    describe("raw values reaching visit dispatch on their class", () => {
      const compileRight = (right: unknown): string =>
        new Visitors.ToSql(fakeRecordConnection).compile(
          new Nodes.Equality(new Table("users").get("id"), right as Nodes.NodeOrValue),
        );
      for (const [label, value] of [
        ["a String", "x"],
        ["a Float", 1.5],
        ["NaN", NaN],
        ["TrueClass", true],
        ["FalseClass", false],
        ["a Time", Temporal.Instant.from("2024-01-01T00:00:00Z")],
        ["a Hash", { a: 1 }],
      ] as const) {
        it(`raises UnsupportedVisitError for ${label}`, () => {
          expect(() => compileRight(value)).toThrow(Visitors.UnsupportedVisitError);
        });
      }
      it("renders an Integer bare", () => {
        expect(compileRight(1)).toBe('"users"."id" = 1');
        expect(compileRight(9007199254740993n)).toBe('"users"."id" = 9007199254740993');
      });

      it("renders IS NULL for Casted(nil) as well as Quoted(nil)", () => {
        const attr = new Table("users").get("id");
        expect(compileRight(new Nodes.Quoted(null))).toBe('"users"."id" IS NULL');
        expect(compileRight(new Nodes.Casted(null, attr))).toBe('"users"."id" IS NULL');
      });

      it("renders IS NULL for a bare NilClass rather than dispatching", () => {
        expect(compileRight(null)).toBe('"users"."id" IS NULL');
        const attr = new Table("users").get("id");
        expect(
          new Visitors.ToSql(fakeRecordConnection).compile(new Nodes.NotEqual(attr, null)),
        ).toBe('"users"."id" IS NOT NULL');
      });

      it("raises UnsupportedVisitError for NilClass on a path that reaches dispatch", () => {
        const v = new Visitors.ToSql(fakeRecordConnection);
        const visitArray = (
          v as unknown as { visitArray(a: ReadonlyArray<unknown>, c: unknown): void }
        ).visitArray;
        expect(() => visitArray.call(v, [null], new Collectors.SQLString())).toThrow(
          Visitors.UnsupportedVisitError,
        );
      });

      it("raises UnsupportedVisitError for a non-finite Float", () => {
        expect(() => compileRight(Infinity)).toThrow(Visitors.UnsupportedVisitError);
      });

      it("dispatches a bare Temporal on its Rails analogue", () => {
        const v = new Visitors.ToSql(fakeRecordConnection);
        const seen: string[] = [];
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitTime = () => {
          seen.push("Time");
          throw new Visitors.UnsupportedVisitError("x");
        };
        spy.visitDate = () => {
          seen.push("Date");
          throw new Visitors.UnsupportedVisitError("x");
        };
        const attr = new Table("users").get("id");
        expect(() =>
          spy.compile(new Nodes.Equality(attr, Temporal.Instant.from("2026-04-30T12:34:56Z"))),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(() =>
          spy.compile(new Nodes.Equality(attr, Temporal.PlainDate.from("2026-04-30"))),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(seen).toEqual(["Time", "Date"]);
      });

      it("does not dispatch a Temporal without a Rails analogue on visit_Time", () => {
        const v = new Visitors.ToSql(fakeRecordConnection);
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitTime = () => {
          throw new Error("visit_Time must not be reached");
        };
        spy.visitDate = () => {
          throw new Error("visit_Date must not be reached");
        };
        const attr = new Table("users").get("id");
        for (const value of [
          Temporal.Duration.from({ hours: 1 }),
          Temporal.PlainYearMonth.from("2026-04"),
          Temporal.PlainMonthDay.from("04-30"),
        ]) {
          expect(() =>
            spy.compile(new Nodes.Equality(attr, value as unknown as Nodes.NodeOrValue)),
          ).toThrow(TypeError);
        }
      });

      it("dispatches a bare Temporal.PlainDateTime on visit_DateTime", () => {
        const v = new Visitors.ToSql(fakeRecordConnection);
        const seen: string[] = [];
        const spy = Object.create(v) as Record<string, unknown> & { compile(n: unknown): string };
        spy.visitDateTime = () => {
          seen.push("DateTime");
          throw new Visitors.UnsupportedVisitError("x");
        };
        expect(() =>
          spy.compile(
            new Nodes.Equality(
              new Table("users").get("id"),
              Temporal.PlainDateTime.from("2026-04-30T12:34:56"),
            ),
          ),
        ).toThrow(Visitors.UnsupportedVisitError);
        expect(seen).toEqual(["DateTime"]);
      });

      it("raises for a bare Temporal but still renders it wrapped", () => {
        const instant = Temporal.Instant.from("2026-04-30T12:34:56.000Z");
        expect(() => compileRight(instant)).toThrow(Visitors.UnsupportedVisitError);
        expect(compileRight(new Nodes.Quoted(instant))).toContain("2026-04-30");
      });

      it("renders once wrapped via quotedNode, as predications do", () => {
        expect(
          new Visitors.ToSql(fakeRecordConnection).compile(new Table("users").get("id").eq("x")),
        ).toBe('"users"."id" = \'x\'');
      });
    });

    it("visit_Set is aliased to visit_Array (joins with ', ')", () => {
      const v = new Visitors.ToSql(fakeRecordConnection);
      const collector = new Collectors.SQLString();
      const set = new Set<Nodes.NodeOrValue>([new Nodes.Quoted(1), new Nodes.Quoted(2)]);
      const out = (
        v as unknown as {
          visitSet(
            s: ReadonlySet<Nodes.NodeOrValue>,
            c: Collectors.SQLString,
          ): Collectors.SQLString;
        }
      ).visitSet(set, collector);
      expect(out.value).toBe("1, 2");
    });
  });

  describe("Nodes::Equality", () => {
    it("emits IS NULL for a BindParam wrapping a bare null", () => {
      const node = new Nodes.Equality(users.get("id"), new Nodes.BindParam(null));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toContain("IS NULL");
    });

    it("emits IS NOT NULL for a NotEqual BindParam wrapping a bare null", () => {
      const node = new Nodes.NotEqual(users.get("id"), new Nodes.BindParam(null));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toContain("IS NOT NULL");
    });
  });

  const posts = new Table("posts");
  it("should mark collector as non-retryable if SQL literal is marked as retryable", () => {
    const lit = new Nodes.SqlLiteral("1", { retryable: true });
    const collector = new Visitors.ToSql(fakeRecordConnection).accept(
      lit,
      new Collectors.SQLString(),
    );
    expect(collector.retryable).toBe(true);
  });

  describe("Nodes::DeleteStatement", () => {
    it("renders DELETE FROM via the table visitor", () => {
      const stmt = new DeleteManager().from(users).ast;
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(stmt);
      expect(sql).toBe('DELETE FROM "users"');
    });

    it("treats a JoinSource with no joins as no-join-source (Rails has_join_sources?)", () => {
      const stmt = new Nodes.DeleteStatement(new Nodes.JoinSource(users));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(stmt);
      expect(sql).toBe('DELETE FROM "users"');
    });

    it("renders TableAlias on the left when join sources are present", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const join = new Nodes.InnerJoin(
        posts,
        new Nodes.On(new Nodes.Equality(posts.get("user_id"), users.get("id"))),
      );
      const stmt = new Nodes.DeleteStatement(new Nodes.JoinSource(aliased, [join]));
      stmt.wheres.push(new Nodes.Equality(users.get("id"), 1));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(stmt);
      expect(sql).toContain('DELETE "users" "u" FROM "users" "u"');
      expect(sql).toContain("INNER JOIN");
      expect(sql).toContain("WHERE");
    });
  });

  describe("Nodes::InsertStatement", () => {
    it("prefers values over select when both are present", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      const sub = users.project(users.get("name"));
      mgr.ast.select = sub.ast;
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(mgr.ast);
      expect(sql).toContain("VALUES");
      expect(sql).toContain("'dean'");
      expect(sql).not.toContain("SELECT");
    });

    it("routes column names through quoteColumnName", () => {
      const mgr = new InsertManager(users);
      mgr.insert([[users.get("name"), "dean"]]);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(mgr.ast);
      expect(sql).toContain('("name")');
    });
  });

  it("should not quote BindParams used as part of a ValuesList", () => {
    const values = new Nodes.ValuesList([[new Nodes.BindParam()]]);
    const sql = new Visitors.ToSql(fakeRecordConnection).compile(values);
    expect(sql).toContain("(?)");
  });

  describe("TableAlias", () => {
    it("emits a subquery alias bare (Rails AliasPredication via SqlLiteral name)", () => {
      const sub = users.project(users.get("id")).as("sub");
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(sub);
      expect(sql).toContain(") sub");
      expect(sql).not.toContain('"sub"');
    });

    it("keeps regular table aliases quoted", () => {
      const aliased = new Nodes.TableAlias(users, "u");
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(aliased);
      expect(sql).toContain('"users" "u"');
    });
  });

  it("visits an ActiveModel::Attribute assignment right instead of quoting it", () => {
    const node = new Nodes.Assignment(
      users.get("name"),
      AMAttribute.fromUser("name", "x", new ValueType()),
    );
    expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe('"users"."name" = ?');
  });

  it("should visit_Date with fractional seconds retains microseconds", () => {
    const d = Temporal.Instant.from("2026-04-18T13:00:41.729Z");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2026-04-18 13:00:41.729000'");
  });

  it("should visit_Date-like with 1-digit fraction normalises to microseconds", () => {
    const obj = Temporal.PlainDateTime.from("2020-01-02T03:04:05.7");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(obj));
    expect(sql).toBe("'2020-01-02 03:04:05.700000'");
  });

  it("should visit_Date with zero ms emits bare seconds (Rails quoted_date format)", () => {
    const d = Temporal.Instant.from("2000-01-01T00:00:00.000Z");
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(d));
    expect(sql).toBe("'2000-01-01 00:00:00'");
  });

  it("should visit_Date-like with no fractional part (no trailing Z artifact)", () => {
    const obj = Temporal.PlainDate.from("2026-01-01").toPlainDateTime();
    const sql = new Visitors.ToSql(testConnection).compile(new Nodes.Quoted(obj));
    expect(sql).toBe("'2026-01-01 00:00:00'");
    expect(sql).not.toContain("Z");
  });

  it("should extract Date as bind param in compileWithBinds", () => {
    const users = new Table("users");
    const d = Temporal.Instant.from("2020-01-02T12:00:00.000Z");
    const node = users.get("created_at").eq(new Nodes.Quoted(d));
    const [sql, binds] = compileWithBinds(new Visitors.ToSql(fakeRecordConnection), node);
    expect(sql).toContain("2020-01-02");
    expect(sql).not.toContain("?");
    expect(binds).toHaveLength(0);
  });

  describe("Nodes::Union with ORDER/LIMIT/OFFSET operands", () => {
    it("wraps a SELECT operand with ORDER BY", () => {
      const a = users.project(star());
      const b = users.project(star()).order(users.get("id"));
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" UNION (SELECT * FROM "users" ORDER BY "users"."id") )',
      );
    });

    it("wraps a SELECT operand with LIMIT", () => {
      const a = users.project(star());
      const b = users.project(star()).take(5);
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe('( SELECT * FROM "users" UNION (SELECT * FROM "users" LIMIT 5) )');
    });

    it("wraps a SELECT operand with OFFSET", () => {
      const a = users.project(star());
      const b = users.project(star()).skip(10);
      const node = new Nodes.Union(a.ast, b.ast);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe('( SELECT * FROM "users" UNION (SELECT * FROM "users" OFFSET 10) )');
    });
  });

  describe("Nodes::Intersect", () => {
    it("flattens nested intersects", () => {
      const a = users.project(star());
      const b = users.project(star());
      const c = users.project(star());
      const node = new Nodes.Intersect(a.ast, new Nodes.Intersect(b.ast, c.ast));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" INTERSECT ( SELECT * FROM "users" INTERSECT SELECT * FROM "users" ) )',
      );
    });
  });

  describe("Nodes::Except", () => {
    it("flattens nested excepts", () => {
      const a = users.project(star());
      const b = users.project(star());
      const c = users.project(star());
      const node = new Nodes.Except(a.ast, new Nodes.Except(b.ast, c.ast));
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe(
        '( SELECT * FROM "users" EXCEPT ( SELECT * FROM "users" EXCEPT SELECT * FROM "users" ) )',
      );
    });
  });

  it("compileWithBinds extracts bind values", () => {
    const v = new Visitors.ToSql(fakeRecordConnection);
    const table = new Table("users");
    const mgr = table.project(star()).where(table.get("id").eq(new Nodes.BindParam(42)));
    const [sql, binds] = compileWithBinds(v, mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("42");
    expect(binds).toEqual([42]);
  });

  it("compileWithBinds handles multiple bind params", () => {
    const v = new Visitors.ToSql(fakeRecordConnection);
    const table = new Table("users");
    const mgr = table
      .project(star())
      .where(table.get("name").eq(new Nodes.BindParam("alice")))
      .where(table.get("age").gt(new Nodes.BindParam(21)));
    const [sql, binds] = compileWithBinds(v, mgr.ast);
    expect(sql).toContain("?");
    expect(sql).not.toContain("alice");
    expect(sql).not.toContain("21");
    expect(binds).toEqual(["alice", 21]);
  });

  it("compileWithBinds with undefined BindParam", () => {
    const v = new Visitors.ToSql(fakeRecordConnection);
    const node = new Nodes.BindParam();
    const [sql, binds] = compileWithBinds(v, node);
    expect(sql).toBe("?");
    expect(binds).toHaveLength(1);
  });

  it("accept accepts external collector", () => {
    const v = new Visitors.ToSql(fakeRecordConnection);
    const table = new Table("users");
    const mgr = table.project(star()).where(table.get("name").eq("alice"));

    const parts: unknown[] = [];
    const binds: unknown[] = [];
    const collector = {
      preparable: false,
      retryable: true,
      append(str: string) {
        parts.push(str);
        return collector;
      },
      addBind(value: unknown) {
        binds.push(value);
        parts.push("?");
        return collector;
      },
      get value() {
        return [parts, binds];
      },
    };

    v.accept(mgr.ast, collector);
    expect(binds).toHaveLength(0);
    expect(parts.some((p) => typeof p === "string" && p.includes("'alice'"))).toBe(true);
    expect(parts.some((p) => typeof p === "string" && p.includes("users"))).toBe(true);
  });

  describe("Nodes::ValuesList row dispatch", () => {
    const probe = {
      quoteTableName: (n: string) => `"${n}"`,
      quoteColumnName: (n: string) => `"${n}"`,
      quoteString: (s: string) => s,
      quote: (v: unknown) => `Q(${String(v)})`,
      quotedBinary: (v: unknown) => `'${String(v)}'`,
      quotedTrue: () => "TRUE",
      quotedFalse: () => "FALSE",
      unquotedTrue: () => true,
      unquotedFalse: () => false,
      sanitizeAsSqlComment: (v: string) => v,
    } as unknown as Visitors.ArelConnection;

    it("quotes a raw row value instead of visiting it", () => {
      const sql = new Visitors.ToSql(probe).compile(new Nodes.ValuesList([[1, "a"]]));
      expect(sql).toBe("VALUES (Q(1), Q(a))");
    });

    it("visits a SqlLiteral row without quoting it", () => {
      const sql = new Visitors.ToSql(probe).compile(
        new Nodes.ValuesList([[new Nodes.SqlLiteral("DEFAULT")]]),
      );
      expect(sql).toBe("VALUES (DEFAULT)");
    });

    it("sends a Quoted row to quote(), which is where Rails raises TypeError", () => {
      const raising = {
        ...probe,
        quote: (v: unknown) => {
          throw new TypeError(`can't quote ${(v as object)?.constructor?.name}`);
        },
      } as unknown as Visitors.ArelConnection;
      expect(() =>
        new Visitors.ToSql(raising).compile(new Nodes.ValuesList([[new Nodes.Quoted(1)]])),
      ).toThrow(/can't quote Quoted/);
    });

    it("visits an ActiveModel::Attribute row instead of quoting it", () => {
      const attr = AMAttribute.fromUser("id", 1, new ValueType());
      const sql = new Visitors.ToSql(probe).compile(new Nodes.ValuesList([[attr]]));
      expect(sql).toBe("VALUES (?)");
    });

    it("quotes an ActiveModel::Attribute duck-type instead of visiting it", () => {
      const sql = new Visitors.ToSql(probe).compile(
        new Nodes.ValuesList([[{ name: "id", valueForDatabase: 1 }]]),
      );
      expect(sql).toBe("VALUES (Q([object Object]))");
    });
  });

  describe("BindParam unboundable short-circuit", () => {
    const unboundable = (sign: 1 | -1) => new Nodes.BindParam({ isUnboundable: () => sign });

    it("GreaterThan short-circuits to 1=0 for positive unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("GreaterThan short-circuits to 1=1 for negative unboundable", () => {
      const node = new Nodes.GreaterThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("GreaterThanOrEqual short-circuits to 1=0 for positive unboundable", () => {
      const node = new Nodes.GreaterThanOrEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("GreaterThanOrEqual short-circuits to 1=1 for negative unboundable", () => {
      const node = new Nodes.GreaterThanOrEqual(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("LessThanOrEqual short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThanOrEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("LessThanOrEqual short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThanOrEqual(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("Equality short-circuits to 1=0 for any unboundable", () => {
      const node = new Nodes.Equality(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("NotEqual short-circuits to 1=1 for any unboundable", () => {
      const node = new Nodes.NotEqual(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=1 for positive unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=1");
    });

    it("LessThan short-circuits to 1=0 for negative unboundable", () => {
      const node = new Nodes.LessThan(users.get("id"), unboundable(-1));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("1=0");
    });

    it("an infinite-but-bounded BindParam does not short-circuit", () => {
      const node = new Nodes.GreaterThan(users.get("id"), new Nodes.BindParam(Infinity));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe('"users"."id" > ?');
    });
  });

  describe("Rails-mirrored private helpers", () => {
    type ToSqlInternals = {
      sanitizeAsSqlComment(value: string | Nodes.SqlLiteral): string;
      quoteTableName(name: string | Nodes.SqlLiteral): string;
      quoteColumnName(name: string | Nodes.SqlLiteral): string;
    };
    const make = (): ToSqlInternals =>
      new Visitors.ToSql(testConnection) as unknown as ToSqlInternals;

    it("sanitizeAsSqlComment passes through SqlLiteral values", () => {
      const literal = new Nodes.SqlLiteral("/* raw */");
      expect(make().sanitizeAsSqlComment(literal)).toBe("/* raw */");
    });

    it("sanitizeAsSqlComment strips comment delimiters and newlines", () => {
      const v = make();
      expect(v.sanitizeAsSqlComment("a /* boom */ b")).toBe("a boom b");
      expect(v.sanitizeAsSqlComment("multi\nline")).toBe("multi line");
      expect(v.sanitizeAsSqlComment("trailing */")).toBe("trailing");
    });

    it("quoteTableName / quoteColumnName double-quote bare names and pass through SqlLiteral", () => {
      const v = make();
      expect(v.quoteTableName("users")).toBe('"users"');
      expect(v.quoteColumnName("name")).toBe('"name"');
      expect(v.quoteTableName('weird"name')).toBe('"weird""name"');
      expect(v.quoteTableName(new Nodes.SqlLiteral("users"))).toBe("users");
    });

    it("visitTable and visitAttribute now route through quoteTableName / quoteColumnName", () => {
      const weird = new Table('we"ird');
      const sql = new Visitors.ToSql(testConnection).compile(weird.get('co"l').eq(1));
      expect(sql).toBe('"we""ird"."co""l" = 1');
    });

    it("collectNodesFor prefixes the spacer and joins with the connector", () => {
      const tbl = new Table("users");
      const sql = tbl
        .where(tbl.get("a").eq(1))
        .where(tbl.get("b").eq(2))
        .project(tbl.get("a"))
        .toSql();
      expect(sql).toContain('WHERE "users"."a" = 1 AND "users"."b" = 2');
    });

    it("collectNodesFor is a no-op when the list is empty", () => {
      const sql = new Table("users").project().toSql();
      expect(sql).toBe('SELECT FROM "users"');
      expect(sql).not.toContain("WHERE");
      expect(sql).not.toContain("GROUP BY");
    });
  });

  describe("Nodes::OptimizerHints (visit)", () => {
    it("emits /*+ HINT */ for an OptimizerHints node with array expr", () => {
      const node = new Nodes.OptimizerHints(["IDX(t1)", "MAX_EXEC_TIME(1000)"]);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toBe("/*+ IDX(t1) MAX_EXEC_TIME(1000) */");
    });

    it("strips embedded comment delimiters from each hint (Rails parity)", () => {
      const node = new Nodes.OptimizerHints(["A */ DROP /*"]);
      const sql = new Visitors.ToSql(testConnection).compile(node);
      expect(sql).toBe("/*+ A DROP */");
      expect(sql.match(/\*\//g)?.length).toBe(1);
    });

    it("accepts SqlLiteral hints (passes through unchanged)", () => {
      const node = new Nodes.OptimizerHints([new Nodes.SqlLiteral("FORCE INDEX (t)")]);
      expect(new Visitors.ToSql(fakeRecordConnection).compile(node)).toBe("/*+ FORCE INDEX (t) */");
    });
  });

  describe("Nodes::Comment placement", () => {
    it("emits exactly one space before each comment in SelectCore (no double space)", () => {
      const tbl = new Table("users");
      const sql = tbl.project(tbl.get("id")).comment("hi", "bye").toSql();
      expect(sql).toBe('SELECT "users"."id" FROM "users" /* hi */ /* bye */');
      expect(sql).not.toContain("  /*");
    });
  });

  describe("schema-qualified table identifier", () => {
    it("quotes each segment of a schema.table name in SELECT and column refs", () => {
      const tbl = new Table("schema.table");
      const sql = new Visitors.ToSql(testConnection).compile(tbl.project(tbl.get("col")).ast);
      expect(sql).toBe('SELECT "schema"."table"."col" FROM "schema"."table"');
    });
  });

  describe("identifier-escape consistency (helper-routed quoting)", () => {
    it("UPDATE SET column quotes embedded double-quotes", () => {
      const tbl = new Table('tab"le');
      const mgr = new UpdateManager().table(tbl).set([[tbl.get('co"l'), 1]]);
      const sql = new Visitors.ToSql(testConnection).compile(mgr.ast);
      expect(sql).toContain('"co""l" = 1');
    });

    it("CTE name escapes embedded double-quotes", () => {
      const inner = new Table("users");
      const cte = new Nodes.Cte('w"in', new SelectManager(inner).project(inner.get("a")));
      const sql = new Visitors.ToSql(testConnection).compile(cte);
      expect(sql).toContain('"w""in" AS');
    });
  });

  describe("Rails-mirrored to_sql tail helpers", () => {
    interface ToSqlInternals {
      isUnboundable(value: unknown): boolean;
      hasGroupByAndHaving(o: { groups: unknown[]; havings: unknown[] }): boolean;
      bindBlock(): (index: number) => string;
    }
    const make = () => new Visitors.ToSql(fakeRecordConnection) as unknown as ToSqlInternals;

    it("isUnboundable returns true only when the value reports unboundable", () => {
      const v = make();
      expect(v.isUnboundable({ isUnboundable: () => 1 })).toBe(true);
      expect(v.isUnboundable({ isUnboundable: () => false })).toBe(false);
      expect(v.isUnboundable({})).toBe(false);
      expect(v.isUnboundable(null)).toBe(false);
    });

    it("hasGroupByAndHaving requires both groups and havings to be non-empty", () => {
      const v = make();
      expect(v.hasGroupByAndHaving({ groups: [1], havings: [1] })).toBe(true);
      expect(v.hasGroupByAndHaving({ groups: [], havings: [1] })).toBe(false);
      expect(v.hasGroupByAndHaving({ groups: [1], havings: [] })).toBe(false);
    });

    it("bindBlock returns a placeholder callback emitting ? by default", () => {
      const block = make().bindBlock();
      expect(block(0)).toBe("?");
      expect(block(7)).toBe("?");
    });

    it("an overridden bindBlock takes effect at every base addBind callsite", () => {
      class NumberedVisitor extends Visitors.ToSql {
        idx = 0;
        protected override bindBlock(): (i: number) => string {
          return () => `$${++this.idx}`;
        }
      }
      const tbl = new Table("users");
      const v = new NumberedVisitor(fakeRecordConnection);
      const [sql] = compileWithBinds(
        v,
        tbl
          .where(tbl.get("id").eq(new Nodes.BindParam(1)))
          .where(tbl.get("name").eq(new Nodes.Casted("hi", tbl.get("name"))))
          .project(tbl.get("id")).ast,
      );
      expect(sql).toContain("$1");
      expect(sql).toContain("'hi'");
      expect(sql).not.toContain("?");
    });

    it("visitActiveModelAttribute routes through bindBlock (Rails parity)", () => {
      class NumberedVisitor extends Visitors.ToSql {
        idx = 0;
        protected override bindBlock(): (i: number) => string {
          return (i: number) => `$${i}`;
        }
      }
      const v = new NumberedVisitor(fakeRecordConnection);
      const collector = new Collectors.SQLString();
      (
        v as unknown as { visitActiveModelAttribute(o: AMAttribute, c: Collectors.SQLString): void }
      ).visitActiveModelAttribute(
        AMAttribute.fromDatabase("name", "x", new StringType()),
        collector,
      );
      expect(collector.value).toBe("$1");
    });

    it("visitArelSelectManager wraps the manager's AST in parens", () => {
      const tbl = new Table("users");
      const mgr = new SelectManager(tbl).project(tbl.get("id"));
      const v = new Visitors.ToSql(fakeRecordConnection);
      const collector = new Collectors.SQLString();
      (
        v as unknown as { visitArelSelectManager(o: { ast: Nodes.Node }, c: unknown): void }
      ).visitArelSelectManager({ ast: mgr.ast as unknown as Nodes.Node }, collector);
      expect(collector.value).toMatch(/^\(SELECT.*\)$/);
    });

    it("visitArelNodesWhen / Else are reachable as standalone visits (Case still works)", () => {
      const tbl = new Table("users");
      const node = new Nodes.Case(tbl.get("status")).when("ok", 1).when("warn", 2)["else"](0);
      const sql = new Visitors.ToSql(fakeRecordConnection).compile(node);
      expect(sql).toContain("CASE");
      expect(sql).toContain("WHEN");
      expect(sql).toContain("THEN");
      expect(sql).toContain("ELSE");
      expect(sql).toContain("END");
    });

    it("dispatches Nodes.When and Nodes.Else as top-level visits", () => {
      const tbl = new Table("users");
      const whenNode = new Nodes.When(tbl.get("status"), new Nodes.SqlLiteral("1"));
      const elseNode = new Nodes.Else(new Nodes.SqlLiteral("0"));
      expect(new Visitors.ToSql(fakeRecordConnection).compile(whenNode)).toBe(
        'WHEN "users"."status" THEN 1',
      );
      expect(new Visitors.ToSql(fakeRecordConnection).compile(elseNode)).toBe("ELSE 0");
    });

    describe("unboundable short-circuits", () => {
      const tbl = new Table("users");
      const compile = (n: Nodes.Node) => new Visitors.ToSql(fakeRecordConnection).compile(n);
      const id = tbl.get("id");
      const unbounded = (sign: 1 | -1) => new Nodes.BindParam({ isUnboundable: () => sign });

      it("Equality with an unboundable bind collapses to 1=0", () => {
        expect(compile(id.eq(unbounded(1)))).toBe("1=0");
        expect(compile(id.eq(unbounded(-1)))).toBe("1=0");
      });
      it("NotEqual with an unboundable bind collapses to 1=1", () => {
        expect(compile(id.notEq(unbounded(1)))).toBe("1=1");
        expect(compile(id.notEq(unbounded(-1)))).toBe("1=1");
      });
      it("GreaterThan +1 → 1=0; -1 → 1=1", () => {
        expect(compile(id.gt(unbounded(1)))).toBe("1=0");
        expect(compile(id.gt(unbounded(-1)))).toBe("1=1");
      });
      it("GreaterThanOrEqual +1 → 1=0; -1 → 1=1", () => {
        expect(compile(id.gteq(unbounded(1)))).toBe("1=0");
        expect(compile(id.gteq(unbounded(-1)))).toBe("1=1");
      });
      it("LessThan +1 → 1=1; -1 → 1=0", () => {
        expect(compile(id.lt(unbounded(1)))).toBe("1=1");
        expect(compile(id.lt(unbounded(-1)))).toBe("1=0");
      });
      it("LessThanOrEqual +1 → 1=1; -1 → 1=0", () => {
        expect(compile(id.lteq(unbounded(1)))).toBe("1=1");
        expect(compile(id.lteq(unbounded(-1)))).toBe("1=0");
      });
      it("In filters unboundable values; all-unboundable collapses to 1=0", () => {
        expect(compile(id.in([unbounded(1), unbounded(-1)]))).toBe("1=0");
      });
      it("In retains bounded values when mixed with unboundable", () => {
        expect(compile(id.in([1, unbounded(1), 2]))).toBe('"users"."id" IN (1, 2)');
      });
      it("NotIn filters unboundable values; all-unboundable collapses to 1=1", () => {
        expect(compile(id.notIn([unbounded(1), unbounded(-1)]))).toBe("1=1");
      });
      it("NotIn retains bounded values when mixed with unboundable", () => {
        expect(compile(id.notIn([1, unbounded(1), 2]))).toBe('"users"."id" NOT IN (1, 2)');
      });

      it("a raw Float::INFINITY is bounded and renders as a value", () => {
        expect(compile(id.eq(Infinity))).toBe('"users"."id" = Infinity');
        expect(compile(id.gt(-Infinity))).toBe('"users"."id" > -Infinity');
        expect(compile(id.in([1, Infinity, 2]))).toBe('"users"."id" IN (1, Infinity, 2)');
      });

      it("Quoted wrapping INFINITY is bounded too (Quoted has no unboundable?)", () => {
        const eq = new Nodes.Equality(id, new Nodes.Quoted(Infinity));
        expect(compile(eq)).toBe('"users"."id" = Infinity');
      });

      it("bounded comparisons are unaffected", () => {
        expect(compile(id.gt(5))).toBe('"users"."id" > 5');
        expect(compile(id.lt(5))).toBe('"users"."id" < 5');
        expect(compile(id.eq(5))).toBe('"users"."id" = 5');
      });

      it("Equality with null still emits IS NULL (not the unboundable branch)", () => {
        expect(compile(id.eq(null))).toBe('"users"."id" IS NULL');
        expect(compile(id.notEq(null))).toBe('"users"."id" IS NOT NULL');
      });
    });

    describe("unboundableSign protocol", () => {
      interface Internals {
        unboundableSign(v: unknown): 1 | -1 | 0;
        isUnboundable(v: unknown): boolean;
      }
      const v = () => new Visitors.ToSql(fakeRecordConnection) as unknown as Internals;

      it("returns 0 for values that do not respond to isUnboundable", () => {
        expect(v().unboundableSign(Infinity)).toBe(0);
        expect(v().unboundableSign(-Infinity)).toBe(0);
        expect(v().unboundableSign(0)).toBe(0);
        expect(v().unboundableSign(null)).toBe(0);
        expect(v().unboundableSign(undefined)).toBe(0);
        expect(v().unboundableSign("foo")).toBe(0);
      });

      it("does not consult isInfinite(), which is a different predicate", () => {
        expect(v().unboundableSign(new Nodes.Quoted(Infinity))).toBe(0);
        expect(v().unboundableSign(new Nodes.Quoted(-Infinity))).toBe(0);
        expect(v().unboundableSign({ isInfinite: () => 1 })).toBe(0);
        const casted = new Nodes.Casted(Infinity, new Table("users").get("id"));
        expect(v().unboundableSign(casted)).toBe(0);
      });

      it("BindParam delegates isUnboundable to its value (bind_param.rb:39-40)", () => {
        expect(v().unboundableSign(new Nodes.BindParam({ isUnboundable: () => -1 }))).toBe(-1);
        expect(v().unboundableSign(new Nodes.BindParam(Infinity))).toBe(0);
      });

      it("honours an isUnboundable() protocol returning a sign or boolean", () => {
        expect(v().unboundableSign({ isUnboundable: () => 1 })).toBe(1);
        expect(v().unboundableSign({ isUnboundable: () => -1 })).toBe(-1);
        expect(v().unboundableSign({ isUnboundable: () => false })).toBe(0);
      });

      it("isUnboundable is the truthy wrapper of unboundableSign", () => {
        expect(v().isUnboundable({ isUnboundable: () => 1 })).toBe(true);
        expect(v().isUnboundable({ isUnboundable: () => -1 })).toBe(true);
        expect(v().isUnboundable(Infinity)).toBe(false);
        expect(v().isUnboundable(5)).toBe(false);
        expect(v().isUnboundable(null)).toBe(false);
      });
    });

    it("visitArray handles a mix of Node and primitive entries", () => {
      const tbl = new Table("users");
      const v = new Visitors.ToSql(fakeRecordConnection);
      const collector = new Collectors.SQLString();
      const visitArray = (
        v as unknown as { visitArray(a: ReadonlyArray<unknown>, c: unknown): void }
      ).visitArray;
      visitArray.call(v, [tbl.get("a"), 1], collector);
      expect(collector.value).toBe('"users"."a", 1');
      expect(() => visitArray.call(v, ["text"], new Collectors.SQLString())).toThrow(
        Visitors.UnsupportedVisitError,
      );
    });
  });
});
