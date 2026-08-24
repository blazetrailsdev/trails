import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
import { activeLane } from "./connection.js";
import { fixtures } from "../test-fixtures.js";
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

  it("fingerprints the live schema as the boot dump's", async () => {
    const shapes = await schemaShapes(Base.connection);
    expect(fingerprintOf(shapes, dumpedTables(templateSchemaCache()!))).toBe(
      templateSchemaFingerprint(),
    );
  });

  it("stops matching once a canonical table is altered, so no file replays a stale dump", async () => {
    const cached = dumpedTables(templateSchemaCache()!);
    await Base.connection.addColumn("topics", "boot_dump_probe", "string");
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(
        templateSchemaFingerprint(),
      );
    } finally {
      await Base.connection.removeColumn("topics", "boot_dump_probe");
    }
    expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(
      templateSchemaFingerprint(),
    );
  });

  it("still matches when a table the dump never described is added", async () => {
    const cached = dumpedTables(templateSchemaCache()!);
    await Base.connection.createTable("boot_dump_bespoke", {}, (t) => {
      t.string("name");
    });
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(
        templateSchemaFingerprint(),
      );
    } finally {
      await Base.connection.dropTable("boot_dump_bespoke");
    }
  });

  /**
   * sqlite has no column comments — `supports_comments?` is false there
   * (`abstract_adapter.rb:502` returns false and
   * `sqlite3_adapter.rb` has no override) — so the
   * comment arm of the fingerprint is only exercisable on PG and MySQL.
   */
  it.skipIf(activeLane() === "sqlite")(
    "stops matching once a canonical column's comment changes",
    async () => {
      const cached = dumpedTables(templateSchemaCache()!);
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
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(
        templateSchemaFingerprint(),
      );
    },
  );

  it("stops matching once an index is added to a canonical table", async () => {
    const cached = dumpedTables(templateSchemaCache()!);
    await Base.connection.addIndex("topics", "title", { name: "boot_dump_probe_index" });
    try {
      expect(fingerprintOf(await schemaShapes(Base.connection), cached)).not.toBe(
        templateSchemaFingerprint(),
      );
    } finally {
      await Base.connection.removeIndex("topics", { name: "boot_dump_probe_index" });
    }
    expect(fingerprintOf(await schemaShapes(Base.connection), cached)).toBe(
      templateSchemaFingerprint(),
    );
  });
});
