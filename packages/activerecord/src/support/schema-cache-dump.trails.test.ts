import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { activeLane } from "./connection.js";
import { fixtures } from "../test-fixtures.js";
import { itIfSupports } from "./supports.js";
import {
  dumpedTables,
  fingerprintOf,
  schemaShapes,
  templateSchemaCache,
  templateSchemaFingerprint,
} from "./schema-cache-dump.js";

describe("templateSchemaCache", () => {
  fixtures({});

  it("carries the canonical schema globalSetup laid, so the per-file warm needs no reflection", () => {
    const cache = templateSchemaCache();
    expect(cache).not.toBeNull();
    expect(cache!.size).not.toBe(0);
    expect(cache!.getCachedColumnsHash("topics")).toHaveProperty("title");
    expect(cache!.getCachedPrimaryKeys("topics")).toBe("id");
  });

  it("is what the warm left in the pool's cache", () => {
    const live = Base.connection.internalSchemaCache;
    const dumped = templateSchemaCache()!;
    expect(Object.keys(live.getCachedColumnsHash("posts") ?? {})).toEqual(
      Object.keys(dumped.getCachedColumnsHash("posts") ?? {}),
    );
  });

  /**
   * The boot fingerprint is the baseline the replay compares against, but it is
   * not an invariant of a running worker: a file that alters a canonical table
   * and leaves it altered is exactly the case the guard exists for, and the
   * between-file reset restores rows, not shapes (`drop-all-tables.ts`
   * `resetTestTables`). So these assert the property the guard actually needs —
   * that the fingerprint moves for a change to a dumped table and does not move
   * for anything else — against a baseline taken here, not against boot.
   */
  it("recorded a boot fingerprint, and fingerprints a database deterministically", async () => {
    expect(templateSchemaFingerprint()).toEqual(expect.any(String));
    const cached = dumpedTables(templateSchemaCache()!.marshalDump());
    expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(
      fingerprintOf(await schemaShapes(Base.connection), cached),
    );
  });

  it("stops matching once a canonical table is altered, so no file replays a stale dump", async () => {
    const cached = dumpedTables(templateSchemaCache()!.marshalDump());
    const before = fingerprintOf(await schemaShapes(Base.connection), cached);
    await Base.connection.addColumn("topics", "boot_dump_probe", "string");
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(before);
    } finally {
      await Base.connection.removeColumn("topics", "boot_dump_probe");
    }
    expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(before);
  });

  it("still matches when a table the dump never described is added", async () => {
    const cached = dumpedTables(templateSchemaCache()!.marshalDump());
    const before = fingerprintOf(await schemaShapes(Base.connection), cached);
    await Base.connection.createTable("boot_dump_bespoke", {}, (t) => {
      t.string("name");
    });
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(before);
    } finally {
      await Base.connection.dropTable("boot_dump_bespoke");
    }
  });

  /**
   * sqlite has no column comments — `supports_comments?` is false there
   * (`abstract_adapter.rb:502` returns false and `sqlite3_adapter.rb` has no
   * override) — so the comment arm of the fingerprint is only exercisable on PG
   * and MySQL.
   */
  it.skipIf(activeLane() === "sqlite")(
    "stops matching once a canonical column's comment changes",
    async () => {
      const cached = dumpedTables(templateSchemaCache()!.marshalDump());
      const clean = fingerprintOf(await schemaShapes(Base.connection), cached);
      await Base.connection.addColumn("topics", "boot_dump_probe", "string");
      const before = fingerprintOf(await schemaShapes(Base.connection), cached);
      try {
        const commenting = Base.connection as unknown as {
          changeColumnComment(table: string, column: string, comment: string): Promise<void>;
        };
        await commenting.changeColumnComment("topics", "boot_dump_probe", "changed");
        expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(before);
      } finally {
        await Base.connection.removeColumn("topics", "boot_dump_probe");
      }
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(clean);
    },
  );

  it("stops matching once an index is added to a canonical table", async () => {
    const cached = dumpedTables(templateSchemaCache()!.marshalDump());
    const before = fingerprintOf(await schemaShapes(Base.connection), cached);
    await Base.connection.addIndex("topics", "title", { name: "boot_dump_probe_index" });
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(before);
    } finally {
      await Base.connection.removeIndex("topics", { name: "boot_dump_probe_index" });
    }
    expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(before);
  });

  /**
   * A functional index reports no column at all on MySQL —
   * `information_schema.STATISTICS.COLUMN_NAME` is NULL and the expression sits
   * in `EXPRESSION`, which is what `SHOW KEYS`' `Expression` feeds
   * `IndexDefinition#columns` from (`mysql/schema_statements.rb:36-52`). So an
   * expression that changed with the column set unchanged is the one index
   * edit that could leave the fingerprint intact. MariaDB has no such column
   * and no functional indexes at all, hence the capability gate.
   */
  itIfSupports(
    "expression_index",
    "stops matching once a canonical functional index's expression changes",
    async () => {
      const cached = dumpedTables(templateSchemaCache()!.marshalDump());
      const clean = fingerprintOf(await schemaShapes(Base.connection), cached);
      await Base.connection.addIndex("topics", "(lower(title))", { name: "boot_dump_probe_index" });
      try {
        const before = fingerprintOf(await schemaShapes(Base.connection), cached);
        expect(before).not.toBe(clean);
        await Base.connection.removeIndex("topics", { name: "boot_dump_probe_index" });
        await Base.connection.addIndex("topics", "(upper(title))", {
          name: "boot_dump_probe_index",
        });
        expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(before);
      } finally {
        await Base.connection.removeIndex("topics", { name: "boot_dump_probe_index" });
      }
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(clean);
    },
  );
});
