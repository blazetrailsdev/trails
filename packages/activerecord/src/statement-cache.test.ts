import { describe, it, expect, beforeAll } from "vitest";
import { Attribute, ValueType } from "@blazetrails/activemodel";
import { Table as ArelTable, Nodes } from "@blazetrails/arel";
import {
  StatementCache,
  Substitute,
  Query,
  PartialQuery,
  PartialQueryCollector,
  Params,
  BindMap,
} from "./statement-cache.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

describe("StatementCacheTest", () => {
  let adapter: TestDatabaseAdapter;

  beforeAll(async () => {
    adapter = createTestAdapter();
    await defineSchema(adapter, {
      books: canonicalSchema.books,
      authors: canonicalSchema.authors,
    });
  });
  withTransactionalFixtures(() => adapter);

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

  it("PartialQueryCollector starts retryable", () => {
    // Mirrors Arel's SQLString/Composite collectors: retryable until a
    // non-retryable node flips it false during compilation.
    expect(new PartialQueryCollector().retryable).toBe(true);
  });

  it("cacheableQuery propagates the compiled tree's retryable flag", () => {
    const table = new ArelTable("books");

    const retryableArel = table.project(table.get("name"));
    const [retryableQuery] = (adapter as any).cacheableQuery(StatementCache, retryableArel) as [
      Query,
      unknown[],
    ];
    expect(retryableQuery.retryable).toBe(true);

    const rawArel = table.project(table.get("name")).where(new Nodes.SqlLiteral("1 = 1"));
    const [rawQuery] = (adapter as any).cacheableQuery(StatementCache, rawArel) as [
      Query,
      unknown[],
    ];
    expect(rawQuery.retryable).toBe(false);
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
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const roundTripAdapter = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(roundTripAdapter, { books: canonicalSchema.books });
      await roundTripAdapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', [
        "Rails Guide",
      ]);
      await roundTripAdapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', [
        "TS Handbook",
      ]);

      class Book extends Base {
        static {
          this.tableName = "books";
          this.adapter = roundTripAdapter;
        }
      }

      const sql = 'SELECT * FROM "books" WHERE "name" = ?';
      const bindMap = new BindMap([new Substitute()]);
      const cache = new StatementCache(new Query(sql), bindMap, Book);

      const r1 = await cache.execute(["Rails Guide"], roundTripAdapter);
      expect(r1).toHaveLength(1);
      expect(r1[0].readAttribute("name")).toBe("Rails Guide");

      const r2 = await cache.execute(["TS Handbook"], roundTripAdapter);
      expect(r2).toHaveLength(1);
      expect(r2[0].readAttribute("name")).toBe("TS Handbook");
    } finally {
      roundTripAdapter.disconnectBang();
    }
  });

  it("StatementCache.create → execute round-trip with Substitute", async () => {
    await import("./relation.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const roundTripAdapter = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(roundTripAdapter, { authors: canonicalSchema.authors });
      await roundTripAdapter.executeMutation('INSERT INTO "authors" ("name") VALUES (?)', ["Matz"]);
      await roundTripAdapter.executeMutation('INSERT INTO "authors" ("name") VALUES (?)', ["DHH"]);

      class Author extends Base {
        static {
          this.tableName = "authors";
          this.adapter = roundTripAdapter;
        }
      }

      roundTripAdapter.preparedStatements = true;
      const cache = StatementCache.create(roundTripAdapter, (params) => {
        return Author.where({ name: params.bind() }) as any;
      });

      const r1 = await cache.execute(["Matz"], roundTripAdapter);
      expect(r1).toHaveLength(1);
      expect(r1[0].readAttribute("name")).toBe("Matz");

      const r2 = await cache.execute(["DHH"], roundTripAdapter);
      expect(r2).toHaveLength(1);
      expect(r2[0].readAttribute("name")).toBe("DHH");
    } finally {
      roundTripAdapter.disconnectBang();
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

  it("find by does not use statement cache if table name is changed", async () => {
    await import("./relation.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(conn, { liquid: canonicalSchema.liquid, birds: canonicalSchema.birds });
      await conn.executeMutation('INSERT INTO "liquid" ("name") VALUES (?)', ["salty"]);

      class Liquid extends Base {
        static {
          this.tableName = "liquid";
          this.adapter = conn;
        }
      }

      // Warm the statement cache.
      expect((await Liquid.findBy({ name: "salty" }))!.readAttribute("name")).toBe("salty");

      // Changing the table name should change the query that is not cached.
      Liquid.tableName = "birds";
      expect(await Liquid.findBy({ name: "salty" })).toBeNull();
    } finally {
      conn.disconnectBang();
    }
  });

  it("find does not use statement cache if table name is changed", async () => {
    await import("./relation.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");
    const { RecordNotFound } = await import("./errors.js");

    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(conn, { liquid: canonicalSchema.liquid, birds: canonicalSchema.birds });
      await conn.executeMutation('INSERT INTO "liquid" ("name") VALUES (?)', ["salty"]);

      class Liquid extends Base {
        static {
          this.tableName = "liquid";
          this.adapter = conn;
        }
      }

      const liquid = (await Liquid.findBy({ name: "salty" }))!;
      await Liquid.find(liquid.id); // warming the statement cache.

      Liquid.tableName = "birds";
      await expect(Liquid.find(liquid.id)).rejects.toBeInstanceOf(RecordNotFound);
    } finally {
      conn.disconnectBang();
    }
  });

  it("find association does not use statement cache if table name is changed", async () => {
    await import("./relation.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");
    const { Associations, registerModel } = await import("./associations.js");

    const conn = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(conn, {
        liquid: canonicalSchema.liquid,
        molecules: canonicalSchema.molecules,
        birds: canonicalSchema.birds,
      });

      class Liquid extends Base {
        static {
          this.tableName = "liquid";
          this.adapter = conn;
        }
      }
      class Molecule extends Base {
        static {
          this.tableName = "molecules";
          this.adapter = conn;
          this.attribute("liquid_id", "integer");
        }
      }
      registerModel("Liquid", Liquid);
      registerModel("Molecule", Molecule);
      Associations.belongsTo.call(Molecule, "liquid");

      const salty = await Liquid.create({ name: "salty" });
      const molecule = await Molecule.create({ name: "dioxane", liquid_id: salty.id });

      const loaded = (await molecule.association("liquid").loadTarget()) as any;
      expect(loaded.id).toBe(salty.id);

      Liquid.tableName = "birds";
      expect(await (molecule.association("liquid") as any).forceReloadReader()).toBeNull();
    } finally {
      conn.disconnectBang();
    }
  });

  it("StatementCache.create unprepared path uses PartialQuery with Substitute slots", async () => {
    await import("./relation.js");
    const { BetterSQLite3Adapter } =
      await import("./connection-adapters/better-sqlite3-adapter.js");
    const { Base } = await import("./base.js");

    const roundTripAdapter = new BetterSQLite3Adapter(":memory:");
    try {
      await defineSchema(roundTripAdapter, { books: canonicalSchema.books });
      await roundTripAdapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', ["Ruby"]);
      await roundTripAdapter.executeMutation('INSERT INTO "books" ("name") VALUES (?)', [
        "TypeScript",
      ]);

      class Book extends Base {
        static {
          this.tableName = "books";
          this.adapter = roundTripAdapter;
        }
      }

      // preparedStatements defaults to false — uses PartialQuery path
      const cache = StatementCache.create(roundTripAdapter, (params) => {
        return Book.where({ name: params.bind() }) as any;
      });

      const r1 = await cache.execute(["Ruby"], roundTripAdapter);
      expect(r1).toHaveLength(1);
      expect(r1[0].readAttribute("name")).toBe("Ruby");

      const r2 = await cache.execute(["TypeScript"], roundTripAdapter);
      expect(r2).toHaveLength(1);
      expect(r2[0].readAttribute("name")).toBe("TypeScript");
    } finally {
      roundTripAdapter.disconnectBang();
    }
  });
});
