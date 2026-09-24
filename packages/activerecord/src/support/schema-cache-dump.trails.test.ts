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

  it("carries the canonical schema globalSetup laid, so the per-file warm needs no reflection", async () => {
    const cache = await templateSchemaCache();
    expect(cache).not.toBeNull();
    expect(cache!.size).not.toBe(0);
    expect(cache!.getCachedColumnsHash("topics")).toHaveProperty("title");
    expect(cache!.getCachedPrimaryKeys("topics")).toBe("id");
  });

  it("is what the warm left in the pool's cache", async () => {
    const live = (await Base.leaseConnection()).internalSchemaCache;
    const dumped = (await templateSchemaCache())!;
    expect(Object.keys(live.getCachedColumnsHash("posts") ?? {})).toEqual(
      Object.keys(dumped.getCachedColumnsHash("posts") ?? {}),
    );
  });

  it("is one object, reached by every adapter-side consumer after the swap", async () => {
    const conn = await Base.leaseConnection();
    const installed = conn.pool.schemaReflection.loadedCache;
    expect(installed).not.toBeNull();
    expect(conn.internalSchemaCache).toBe(installed);
    expect(Base.connectionPool().poolConfig.schemaReflection.loadedCache).toBe(installed);
    expect(installed).not.toBe(await templateSchemaCache());
  });

  it("recorded a boot fingerprint, and fingerprints a database deterministically", async () => {
    expect(templateSchemaFingerprint()).toEqual(expect.any(String));
    const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
    expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(
      fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached),
    );
  });

  it("stops matching once a canonical table is altered, so no file replays a stale dump", async () => {
    const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
    const before = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
    await (await Base.leaseConnection()).addColumn("topics", "boot_dump_probe", "string");
    try {
      expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).not.toBe(
        before,
      );
    } finally {
      await (await Base.leaseConnection()).removeColumn("topics", "boot_dump_probe");
    }
    expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(before);
  });

  it("still matches when a table the dump never described is added", async () => {
    const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
    const before = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
    await (
      await Base.leaseConnection()
    ).createTable("boot_dump_bespoke", {}, (t) => {
      t.string("name");
    });
    try {
      expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(before);
    } finally {
      await (await Base.leaseConnection()).dropTable("boot_dump_bespoke");
    }
  });

  it.skipIf(activeLane() === "sqlite")(
    "stops matching once a canonical column's comment changes",
    async () => {
      const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
      const clean = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
      await (await Base.leaseConnection()).addColumn("topics", "boot_dump_probe", "string");
      const before = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
      try {
        const commenting = (await Base.leaseConnection()) as unknown as {
          changeColumnComment(table: string, column: string, comment: string): Promise<void>;
        };
        await commenting.changeColumnComment("topics", "boot_dump_probe", "changed");
        expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).not.toBe(
          before,
        );
      } finally {
        await (await Base.leaseConnection()).removeColumn("topics", "boot_dump_probe");
      }
      expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(clean);
    },
  );

  it("stops matching once an index is added to a canonical table", async () => {
    const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
    const before = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
    await (
      await Base.leaseConnection()
    ).addIndex("topics", "title", { name: "boot_dump_probe_index" });
    try {
      expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).not.toBe(
        before,
      );
    } finally {
      await (await Base.leaseConnection()).removeIndex("topics", { name: "boot_dump_probe_index" });
    }
    expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(before);
  });

  itIfSupports(
    "expression_index",
    "stops matching once a canonical functional index's expression changes",
    async () => {
      const cached = dumpedTables((await templateSchemaCache())!.marshalDump());
      const clean = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
      await (
        await Base.leaseConnection()
      ).addIndex("topics", "(lower(title))", { name: "boot_dump_probe_index" });
      try {
        const before = fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached);
        expect(before).not.toBe(clean);
        await (
          await Base.leaseConnection()
        ).removeIndex("topics", { name: "boot_dump_probe_index" });
        await (
          await Base.leaseConnection()
        ).addIndex("topics", "(upper(title))", {
          name: "boot_dump_probe_index",
        });
        expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).not.toBe(
          before,
        );
      } finally {
        await (
          await Base.leaseConnection()
        ).removeIndex("topics", { name: "boot_dump_probe_index" });
      }
      expect(fingerprintOf(await schemaShapes(await Base.leaseConnection()), cached)).toBe(clean);
    },
  );
});
