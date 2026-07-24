import { describe, expect, test } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { FkSafeDropOrderHost } from "./canonical-schema.js";
import {
  ensureCanonicalTables,
  fkSafeDropOrder,
  loadCanonicalSchema,
  rebuildCanonicalTables,
} from "./canonical-schema.js";

// Runs on SQLite regardless of the ambient ARCONN adapter (it constructs its own
// in-memory adapters), which is where any faithful-transcription slip surfaces:
// column names, types, defaults, nullability, PKs, and indexes all appear in the
// dumped DDL.

// `selectAll` returns a `Result` whose rows are positional arrays; `toArray()`
// maps them to hash rows via the column index, so `r.type`/`r.name`/`r.sql`
// resolve to real values. Reading the raw `{ columns, rows }` array rows
// directly instead silently collapses every dump line to
// "undefined undefined: undefined".
async function dumpSchema(adapter: AbstractAdapter): Promise<string> {
  const res = await adapter.selectAll(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type, sql",
  );
  return res
    .toArray()
    .map((r) => `${r.type} ${r.name}: ${r.sql}`)
    .join("\n");
}

describe("loadCanonicalSchema", () => {
  test("lays down real canonical DDL for hundreds of tables", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const dump = await dumpSchema(adapter);

      // Sanity floor: the canonical schema is hundreds of tables + indexes, so a
      // silently-empty dump can't pass this test.
      expect(dump.split("\n").length).toBeGreaterThan(300);
      // Content floor: the dump must carry real DDL, not placeholder rows — a
      // shape mismatch collapses every line to "undefined undefined: undefined".
      expect(dump).not.toContain("undefined undefined: undefined");
      expect(dump).toMatch(/table topics: CREATE TABLE "?topics"?/);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});

describe("rebuildCanonicalTables", () => {
  test("drops + recreates a named subset to its canonical shape", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      // Simulate a sibling file drifting `topics` to a reduced shape on the
      // shared DB, then rebuild it back to canonical.
      await adapter.executeMutation("DROP TABLE topics");
      await adapter.executeMutation("CREATE TABLE topics (id integer PRIMARY KEY, title varchar)");
      expect(await dumpSchema(adapter)).not.toBe(canonical);

      await rebuildCanonicalTables(adapter, ["topics"]);
      expect(await dumpSchema(adapter)).toBe(canonical);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("rebuilds a referencing table when only its target was named", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      // Naming only the FK target must still restore the child: MySQL refuses to
      // drop a table a live foreign key points at.
      await rebuildCanonicalTables(adapter, ["fk_test_has_pk"]);
      const dump = await dumpSchema(adapter);
      expect(dump).toBe(canonical);
      expect(dump).toContain('CONSTRAINT "fk_name" FOREIGN KEY ("fk_id")');
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("throws on an unknown canonical table name", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await expect(rebuildCanonicalTables(adapter, ["topics", "not_a_real_table"])).rejects.toThrow(
        /unknown canonical table\(s\): not_a_real_table/,
      );
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});

describe("fkSafeDropOrder", () => {
  // Stands in for the live database: `fks` maps a table to the tables it
  // references, as `foreignKeys` would report them.
  function host(tables: string[], fks: Record<string, string[]> = {}): FkSafeDropOrderHost {
    return {
      tables: async () => tables,
      foreignKeys: async (name) => (fks[name] ?? []).map((toTable) => ({ toTable })),
    };
  }

  test("drops a referencing table before its target", async () => {
    // Registry order: lessons_students (referencer) is registered *before*
    // students (target), so reversing registry order would drop students first.
    const order = await fkSafeDropOrder(
      host(["lessons_students", "students"], { lessons_students: ["students"] }),
      ["lessons_students", "students"],
    );
    expect(order).toEqual(["lessons_students", "students"]);
  });

  test("keeps input order when no foreign keys are declared", async () => {
    const order = await fkSafeDropOrder(host(["lessons_students", "students"]), [
      "lessons_students",
      "students",
    ]);
    expect(order).toEqual(["lessons_students", "students"]);
  });

  test("ignores foreign keys pointing outside the dropped set", async () => {
    const order = await fkSafeDropOrder(host(["a", "b"], { a: ["elsewhere"], b: ["a"] }), [
      "a",
      "b",
    ]);
    expect(order).toEqual(["b", "a"]);
  });

  test("skips tables that do not exist yet", async () => {
    const calls: string[] = [];
    const base = host(["b"], { a: ["b"] });
    const order = await fkSafeDropOrder(
      {
        tables: base.tables,
        foreignKeys: async (name) => {
          calls.push(name);
          return base.foreignKeys(name);
        },
      },
      ["a", "b"],
    );
    expect(calls).toEqual(["b"]);
    expect(order).toEqual(["a", "b"]);
  });

  test("falls back to input order for a cycle", async () => {
    const order = await fkSafeDropOrder(host(["a", "b"], { a: ["b"], b: ["a"] }), ["a", "b"]);
    expect(order).toEqual(["a", "b"]);
  });
});

// Read the live table-name set from sqlite_master.
async function tableNames(adapter: AbstractAdapter): Promise<Set<string>> {
  const res = await adapter.selectAll("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(res.pluck("name").map((name) => String(name)));
}

describe("ensureCanonicalTables", () => {
  test("creates only the missing named tables, restoring canonical shape", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      const canonical = await dumpSchema(adapter);

      // Drop one table; ensure recreates just it (drop-free for the survivors)
      // and restores it to its full canonical shape.
      await adapter.executeMutation("DROP TABLE topics");
      expect(await tableNames(adapter)).not.toContain("topics");

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await tableNames(adapter)).toContain("topics");
      expect(await dumpSchema(adapter)).toBe(canonical);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("is a no-op when every named table already exists", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      // A drifted `topics` must survive: ensure creates nothing (all present)
      // and — unlike rebuildCanonicalTables — never drops to restore shape.
      await adapter.executeMutation("DROP TABLE topics");
      await adapter.executeMutation("CREATE TABLE topics (id integer PRIMARY KEY, title varchar)");
      const drifted = await dumpSchema(adapter);

      await ensureCanonicalTables(adapter, ["topics", "authors"]);
      expect(await dumpSchema(adapter)).toBe(drifted);
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });

  test("throws on an unknown canonical table name", async () => {
    const adapter = new BetterSQLite3Adapter(":memory:") as unknown as AbstractAdapter;
    try {
      await loadCanonicalSchema(adapter);
      await expect(ensureCanonicalTables(adapter, ["topics", "not_a_real_table"])).rejects.toThrow(
        /unknown canonical table\(s\): not_a_real_table/,
      );
    } finally {
      await (adapter as unknown as BetterSQLite3Adapter).close();
    }
  });
});
