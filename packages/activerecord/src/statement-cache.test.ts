import { describe, it, expect } from "vitest";
import { Attribute, ValueType } from "@blazetrails/activemodel";
import {
  StatementCache,
  Substitute,
  Query,
  PartialQuery,
  PartialQueryCollector,
  Params,
  BindMap,
} from "./statement-cache.js";

describe("StatementCacheTest", () => {
  it("statement cache", () => {
    const sub = new Substitute();
    expect(sub).toBeInstanceOf(Substitute);
    const params = new Params();
    expect(params.bind()).toBeInstanceOf(Substitute);
  });

  it("statement cache id", () => {
    const s1 = new Substitute();
    const s2 = new Substitute();
    expect(s1).not.toBe(s2);
  });

  it("statement cache with simple statement", () => {
    const query = new Query("SELECT * FROM users WHERE id = ?");
    expect(query.sqlFor([], {})).toBe("SELECT * FROM users WHERE id = ?");
    expect(query.retryable).toBe(false);
  });

  it("statement cache with complex statement", () => {
    const query = new Query("SELECT * FROM users WHERE id = ? AND name = ?", {
      retryable: true,
    });
    expect(query.sqlFor([], {})).toBe("SELECT * FROM users WHERE id = ? AND name = ?");
    expect(query.retryable).toBe(true);
  });

  it("statement cache with strictly cast attribute", () => {
    const bindMap = new BindMap([new Substitute(), "static"]);
    const result = bindMap.bind(["replaced"]);
    expect(result[0]).toBe("replaced");
    expect(result[1]).toBe("static");
  });

  it("statement cache values differ", () => {
    const bindMap = new BindMap([new Substitute(), new Substitute()]);
    const r1 = bindMap.bind(["a", "b"]);
    const r2 = bindMap.bind(["c", "d"]);
    expect(r1).toEqual(["a", "b"]);
    expect(r2).toEqual(["c", "d"]);
  });

  it("unprepared statements dont share a cache with prepared statements", () => {
    const prepared = StatementCache.query("SELECT 1");
    const partial = StatementCache.partialQuery(["SELECT ", new Substitute()]);
    expect(prepared).toBeInstanceOf(Query);
    expect(partial).toBeInstanceOf(PartialQuery);
    expect(prepared).not.toBeInstanceOf(PartialQuery);
  });

  it("PartialQuery substitutes bind values", () => {
    const partial = new PartialQuery(["SELECT * FROM users WHERE name = ", new Substitute()]);
    const sql = partial.sqlFor(["alice"], {
      quote: (v: unknown) => `'${String(v)}'`,
    });
    expect(sql).toBe("SELECT * FROM users WHERE name = 'alice'");
  });

  it("PartialQueryCollector collects parts and binds", () => {
    const collector = new PartialQueryCollector();
    collector.append("SELECT * FROM users WHERE id = ");
    collector.addBind(42);
    const [parts, binds] = collector.value;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe("SELECT * FROM users WHERE id = ");
    expect(parts[1]).toBeInstanceOf(Substitute);
    expect(binds).toEqual([42]);
  });

  it("unsupportedValue rejects null, arrays, ranges", () => {
    expect(StatementCache.unsupportedValue(null)).toBe(true);
    expect(StatementCache.unsupportedValue(undefined)).toBe(true);
    expect(StatementCache.unsupportedValue([1, 2])).toBe(true);
    expect(StatementCache.unsupportedValue("hello")).toBe(false);
    expect(StatementCache.unsupportedValue(42)).toBe(false);
  });

  it("BindMap with Attribute containing Substitute", () => {
    const attr = Attribute.withCastValue("name", new Substitute(), new ValueType());
    const bindMap = new BindMap([attr]);
    const result = bindMap.bind(["typed_value"]);
    expect(result[0]).toBeInstanceOf(Attribute);
    expect((result[0] as Attribute).value).toBe("typed_value");
  });

  it("static factory methods", () => {
    expect(StatementCache.query("SQL")).toBeInstanceOf(Query);
    expect(StatementCache.partialQuery([])).toBeInstanceOf(PartialQuery);
    expect(StatementCache.partialQueryCollector()).toBeInstanceOf(PartialQueryCollector);
  });

  it("execute round-trip with Query and BindMap", async () => {
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const adapter = new SQLite3Adapter(":memory:");
    try {
      await adapter.executeMutation('CREATE TABLE "books" ("id" INTEGER PRIMARY KEY, "name" TEXT)');
      await adapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', ["Rails Guide"]);
      await adapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', ["TS Handbook"]);

      class Book extends Base {
        static {
          this.tableName = "books";
          this.adapter = adapter;
        }
      }

      const sql = 'SELECT * FROM "books" WHERE "name" = ?';
      const bindMap = new BindMap([new Substitute()]);
      const cache = new StatementCache(new Query(sql), bindMap, Book);

      const r1 = await cache.execute(["Rails Guide"], adapter);
      expect(r1).toHaveLength(1);
      expect(r1[0].readAttribute("name")).toBe("Rails Guide");

      const r2 = await cache.execute(["TS Handbook"], adapter);
      expect(r2).toHaveLength(1);
      expect(r2[0].readAttribute("name")).toBe("TS Handbook");
    } finally {
      adapter.disconnectBang();
    }
  });

  it("StatementCache.create → execute round-trip with Substitute", async () => {
    await import("./relation.js");
    const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const adapter = new SQLite3Adapter(":memory:");
    try {
      await adapter.executeMutation(
        'CREATE TABLE "authors" ("id" INTEGER PRIMARY KEY, "name" TEXT)',
      );
      await adapter.executeMutation('INSERT INTO "authors" ("name") VALUES (?)', ["Matz"]);
      await adapter.executeMutation('INSERT INTO "authors" ("name") VALUES (?)', ["DHH"]);

      class Author extends Base {
        static {
          this.tableName = "authors";
          this.adapter = adapter;
        }
      }

      adapter.preparedStatements = true;
      const cache = StatementCache.create(adapter, (params) => {
        return Author.where({ name: params.bind() }) as any;
      });

      const r1 = await cache.execute(["Matz"], adapter);
      expect(r1).toHaveLength(1);
      expect(r1[0].readAttribute("name")).toBe("Matz");

      const r2 = await cache.execute(["DHH"], adapter);
      expect(r2).toHaveLength(1);
      expect(r2[0].readAttribute("name")).toBe("DHH");
    } finally {
      adapter.disconnectBang();
    }
  });

  it("PartialQueryCollector produces Substitute slots via compileWithCollector", async () => {
    const { Table, Visitors, star } = await import("@blazetrails/arel");
    const v = new Visitors.ToSql();
    const table = new Table("users");
    const mgr = table.project(star).where(table.get("name").eq("alice"));

    const collector = new PartialQueryCollector();
    v.compileWithCollector(mgr.ast, collector);
    const [parts, binds] = collector.value;

    const hasSubstitute = parts.some((p: unknown) => p instanceof Substitute);
    expect(hasSubstitute).toBe(true);
    expect(binds.length).toBeGreaterThan(0);

    // PartialQuery can interpolate values at these Substitute positions
    const pq = new PartialQuery(parts);
    const sql = pq.sqlFor(binds, { quote: (v: unknown) => `'${v}'` });
    expect(sql).toContain('"users"."name"');
    expect(sql).toContain("alice");
    expect(sql).not.toContain("?");
  });
});
