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

  for (const method of ["dropTable", "addIndex", "execute", "schemaCreation"]) {
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

  it("does not see a subclass that overrides createTable on its own prototype", async () => {
    class Probe extends BetterSQLite3Adapter {
      override async createTable(): Promise<void> {}
    }

    const probe = new Probe(":memory:");
    try {
      const err = await loadSchema(probe as unknown as AbstractAdapter).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(String(err)).not.toMatch(/is stubbed/);
    } finally {
      await probe.close();
    }
  });

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
