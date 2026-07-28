import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AbstractSQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../../connection-adapters/better-sqlite3-adapter.js";

describe("SqliteAdapter", () => {
  let adapter: AbstractSQLite3Adapter;

  beforeEach(() => {
    adapter = new BetterSQLite3Adapter(":memory:");
  });

  afterEach(async () => {
    await adapter.close();
  });

  // TS-only coverage for the alter_table rebuild: a typeless column has BLOB
  // affinity, and both the throwaway "a"-prefixed buffer and the rebuilt table
  // have to keep the declared type empty or the affinity silently becomes TEXT.
  describe("alterTable", () => {
    it("round-trips a typeless (BLOB affinity) column", async () => {
      await adapter.exec(
        `CREATE TABLE "affinities" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "untyped", "doomed" varchar)`,
      );
      await adapter.executeMutation(`INSERT INTO "affinities" ("untyped") VALUES (42)`);

      await adapter.removeColumn("affinities", "doomed");

      const columns = await adapter.columns("affinities");
      expect(columns.map((c) => c.name)).toEqual(["id", "untyped"]);
      expect(columns.find((c) => c.name === "untyped")?.sqlType).toBe("");
      const rows = await adapter.selectAll(`SELECT typeof("untyped") AS t FROM "affinities"`);
      expect(rows.rows[0]?.[0]).toBe("integer");

      await adapter.dropTable("affinities");
    });
  });

  describe("lookupCastType", () => {
    it("resolves base SQL types", () => {
      expect(adapter.lookupCastType("string").name).toBe("string");
      expect(adapter.lookupCastType("text").name).toBe("text");
      expect(adapter.lookupCastType("integer").name).toBe("integer");
      expect(adapter.lookupCastType("float").name).toBe("float");
      expect(adapter.lookupCastType("boolean").name).toBe("boolean");
      expect(adapter.lookupCastType("date").name).toBe("date");
      expect(adapter.lookupCastType("datetime").name).toBe("datetime");
      expect(adapter.lookupCastType("time").name).toBe("time");
      expect(adapter.lookupCastType("json").name).toBe("json");
      expect(adapter.lookupCastType("blob").name).toBe("binary");
    });

    it("strips precision/scale metadata", () => {
      expect(adapter.lookupCastType("DECIMAL(10, 0)").name).toBe("decimal");
      expect(adapter.lookupCastType("decimal(5,2)").name).toBe("decimal");
      expect(adapter.lookupCastType("INTEGER(11)").name).toBe("integer");
    });

    it("handles case-insensitive types", () => {
      expect(adapter.lookupCastType("TEXT").name).toBe("text");
      expect(adapter.lookupCastType("INTEGER").name).toBe("integer");
      expect(adapter.lookupCastType("BOOLEAN").name).toBe("boolean");
    });

    it("resolves SQLite affinity types via regex", () => {
      expect(adapter.lookupCastType("varchar").name).toBe("string");
      expect(adapter.lookupCastType("character").name).toBe("string");
      expect(adapter.lookupCastType("clob").name).toBe("text");
      expect(adapter.lookupCastType("real").name).toBe("float");
      expect(adapter.lookupCastType("double").name).toBe("float");
      expect(adapter.lookupCastType("bigint").name).toBe("integer");
      expect(adapter.lookupCastType("tinyint").name).toBe("integer");
    });
  });
});

describe("SQLite3Adapter._isMemoryFilename", () => {
  const isMemoryFilename = (
    AbstractSQLite3Adapter as unknown as {
      _isMemoryFilename(filename: string): boolean;
    }
  )._isMemoryFilename.bind(AbstractSQLite3Adapter);

  it("treats :memory: as in-memory", () => {
    expect(isMemoryFilename(":memory:")).toBe(true);
  });

  it("treats file::memory: URI as in-memory", () => {
    expect(isMemoryFilename("file::memory:?cache=shared")).toBe(true);
  });

  it("treats file:?mode=memory URI as in-memory", () => {
    expect(isMemoryFilename("file:memdb1?mode=memory&cache=shared")).toBe(true);
  });

  it("does NOT treat a path containing mode=memory text as in-memory", () => {
    expect(isMemoryFilename("file:/tmp/mode=memory.db")).toBe(false);
  });

  it("treats a regular file path as on-disk", () => {
    expect(isMemoryFilename("/tmp/test.db")).toBe(false);
  });
});

describe("SQLite3Adapter pragmas option", () => {
  let adapter: AbstractSQLite3Adapter | undefined;

  afterEach(async () => {
    await adapter?.close();
    vi.restoreAllMocks();
  });

  it("applies a valid numeric pragma on construction", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { cache_size: 500 } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "cache_size",
    ) as Array<{ cache_size: number }>;
    expect(result[0]?.cache_size).toBe(500);
  });

  it("applies a valid string enum pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { synchronous: "FULL" } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "synchronous",
    ) as Array<{ synchronous: number }>;
    expect(result[0]?.synchronous).toBe(2);
  });

  it("converts boolean true to 1 for pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: true } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(1);
  });

  it("converts boolean false to 0 for pragma", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { pragmas: { foreign_keys: false } });
    const result = (adapter.raw as import("better-sqlite3").Database).pragma(
      "foreign_keys",
    ) as Array<{ foreign_keys: number }>;
    expect(result[0]?.foreign_keys).toBe(0);
  });

  it("warns and skips an invalid pragma name", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { "bad-name!": 1 } as Record<string, number>,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("invalid SQLite pragma name"),
    );
  });

  it("warns and skips a string value with unsafe characters", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    adapter = new BetterSQLite3Adapter(":memory:", {
      pragmas: { synchronous: "FULL; DROP TABLE users" },
    });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unsafe characters"));
  });
});
