/**
 * trails-only cover for `loadSchema`'s arm-probe guard.
 *
 * Rails needs none of this: `load_schema_helper.rb` has one mechanism, and no
 * Ruby test stubs `create_table` to capture the DDL a schema file would emit.
 * trails' arm-content covers do, and one of them (PR #5676) was routed through
 * `loadSchema` in a PR that was green on its own base — the breakage existed
 * only in the merge with #5678, and only on the PG lane.
 * `blazetrails/no-load-schema-with-stubbed-ddl` closes that hole lexically for
 * an activerecord test file; the guard closes it for every other caller, and
 * this file pins it in both directions.
 *
 * Runs on whichever lane is active: the sqlite adapter is in-memory, and the
 * two rejection cases throw before any DDL.
 */
import { describe, expect, it } from "vitest";
import "../sqlite/better-sqlite3.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadSchema } from "./load-schema-helper.js";

async function withAdapter(fn: (adapter: BetterSQLite3Adapter) => Promise<void>): Promise<void> {
  const adapter = new BetterSQLite3Adapter(":memory:");
  try {
    await fn(adapter);
  } finally {
    await adapter.close();
  }
}

describe("load_schema arm-probe guard", () => {
  it("rejects an adapter whose createTable a proxy intercepts", async () => {
    await withAdapter(async (adapter) => {
      const probe = new Proxy(adapter, {
        get(target, prop) {
          if (prop === "createTable") return async () => {};
          return Reflect.get(target, prop, target);
        },
      });

      await expect(loadSchema(probe as unknown as AbstractAdapter)).rejects.toThrow(
        /createTable is stubbed/,
      );
    });
  });

  it("rejects an adapter whose createTable is assigned over", async () => {
    await withAdapter(async (adapter) => {
      (adapter as unknown as { createTable: unknown }).createTable = async () => {};

      await expect(loadSchema(adapter as unknown as AbstractAdapter)).rejects.toThrow(
        /createTable is stubbed/,
      );
    });
  });

  // `createTable` is not the only interception that lays nothing: `runTable`
  // reaches the database through the SchemaStatements companion, so a cover
  // that stubs the members *it* goes through is just as unsafe, and just as
  // invisible outside the PG lane.
  for (const method of ["dropTable", "addIndex", "execute", "schemaStatements"]) {
    it(`rejects an adapter whose ${method} a proxy intercepts`, async () => {
      await withAdapter(async (adapter) => {
        const probe = new Proxy(adapter, {
          get(target, prop) {
            if (prop === method) return async () => {};
            return Reflect.get(target, prop, target);
          },
        });

        await expect(loadSchema(probe as unknown as AbstractAdapter)).rejects.toThrow(
          new RegExp(`${method} is stubbed`),
        );
      });
    });
  }

  // `schemaCreation` is an accessor, not a method, so the guard compares what
  // the real one yields rather than its identity — PostgreSQLAdapter's builds a
  // fresh visitor per read.
  it("rejects an adapter whose schemaCreation a proxy intercepts", async () => {
    await withAdapter(async (adapter) => {
      const probe = new Proxy(adapter, {
        get(target, prop) {
          if (prop === "schemaCreation") return { accept: async () => "" };
          return Reflect.get(target, prop, target);
        },
      });

      await expect(loadSchema(probe as unknown as AbstractAdapter)).rejects.toThrow(
        /schemaCreation is stubbed/,
      );
    });
  });

  it("rejects an adapter whose execute is assigned over", async () => {
    await withAdapter(async (adapter) => {
      (adapter as unknown as { execute: unknown }).execute = async () => [];

      await expect(loadSchema(adapter as unknown as AbstractAdapter)).rejects.toThrow(
        /execute is stubbed/,
      );
    });
  });

  // The counterpart direction: a proxy that only observes must still load, or
  // the guard would break the pooling/logging wrappers that hand `loadSchema` a
  // wrapped connection.
  it("passes an adapter behind a transparent proxy", async () => {
    await withAdapter(async (adapter) => {
      const passthrough = new Proxy(adapter, {
        get: (target, prop) => Reflect.get(target, prop, target),
      });

      await loadSchema(passthrough as unknown as AbstractAdapter);
      expect(await passthrough.tables()).toContain("topics");
    });
  });
});
