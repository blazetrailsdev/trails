/**
 * Adapter-agnostic regression tests for disableReferentialIntegrity.
 *
 * These drive the module function against a fake host (no live PG), pinning
 * the RFC 0060 property that the catalog is enumerated exactly once and the
 * ENABLE pass re-enables the same set the DISABLE pass disabled. The live-PG
 * behavior lives in adapters/postgresql/referential-integrity.test.ts.
 */
import { describe, it, expect, vi } from "vitest";
import { disableReferentialIntegrity } from "./referential-integrity.js";

interface FakeHost {
  quoteTableName(name: string): string;
  execute(sql: string): Promise<unknown>;
  tables(): Promise<string[]>;
  transaction(fn: () => Promise<void>, options: { requiresNew: boolean }): Promise<unknown>;
}

function makeHost(tables: string[]): {
  host: FakeHost;
  executed: string[];
  tablesCalls: () => number;
} {
  const executed: string[] = [];
  const tablesSpy = vi.fn(async () => tables);
  const host: FakeHost = {
    quoteTableName: (name) => `"${name}"`,
    execute: async (sql) => {
      executed.push(sql);
      return [];
    },
    tables: tablesSpy,
    transaction: async (fn) => fn(),
  };
  return { host, executed, tablesCalls: () => tablesSpy.mock.calls.length };
}

describe("disableReferentialIntegrity", () => {
  it("enumerates the table list only once across both passes", async () => {
    const { host, tablesCalls } = makeHost(["a", "b"]);
    await disableReferentialIntegrity.call(host, async () => {});
    expect(tablesCalls()).toBe(1);
  });

  it("re-enables exactly the set that was disabled even if the block changes the tables", async () => {
    let current = ["a", "b"];
    const executed: string[] = [];
    const host: FakeHost = {
      quoteTableName: (name) => `"${name}"`,
      execute: async (sql) => {
        executed.push(sql);
        return [];
      },
      // A later call would report the mutated set; disable/enable must ignore it.
      tables: async () => current,
      transaction: async (fn) => fn(),
    };

    await disableReferentialIntegrity.call(host, async () => {
      current = ["a", "b", "c"];
    });

    const disableSql = executed.find((s) => s.includes("DISABLE TRIGGER ALL"));
    const enableSql = executed.find((s) => s.includes("ENABLE TRIGGER ALL"));
    expect(disableSql).toBe(
      `ALTER TABLE "a" DISABLE TRIGGER ALL;ALTER TABLE "b" DISABLE TRIGGER ALL`,
    );
    expect(enableSql).toBe(`ALTER TABLE "a" ENABLE TRIGGER ALL;ALTER TABLE "b" ENABLE TRIGGER ALL`);
    expect(enableSql).not.toContain(`"c"`);
  });
});
