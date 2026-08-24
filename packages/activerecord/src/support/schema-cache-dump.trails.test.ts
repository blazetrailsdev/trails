import { describe, it, expect } from "vitest";
import { Base } from "../base.js";
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
});
