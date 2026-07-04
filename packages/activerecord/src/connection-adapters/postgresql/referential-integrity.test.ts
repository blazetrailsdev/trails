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
import { InvalidForeignKey, StatementInvalid } from "../../errors.js";

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

  it("toggles only the scoped tables and skips the catalog enumeration when a scope is given", async () => {
    const { host, executed, tablesCalls } = makeHost(["a", "b", "c", "d"]);
    await disableReferentialIntegrity.call(host, async () => {}, ["b", "c"]);
    expect(tablesCalls()).toBe(0);
    const disableSql = executed.find((s) => s.includes("DISABLE TRIGGER ALL"));
    const enableSql = executed.find((s) => s.includes("ENABLE TRIGGER ALL"));
    expect(disableSql).toBe(
      `ALTER TABLE "b" DISABLE TRIGGER ALL;ALTER TABLE "c" DISABLE TRIGGER ALL`,
    );
    expect(enableSql).toBe(`ALTER TABLE "b" ENABLE TRIGGER ALL;ALTER TABLE "c" ENABLE TRIGGER ALL`);
    expect(disableSql).not.toContain(`"a"`);
  });

  it("runs the block without any ALTER when the scope is empty", async () => {
    const { host, executed, tablesCalls } = makeHost(["a", "b"]);
    let ran = false;
    await disableReferentialIntegrity.call(host, async () => {
      ran = true;
    }, []);
    expect(ran).toBe(true);
    expect(tablesCalls()).toBe(0);
    expect(executed).toHaveLength(0);
  });

  it("still warns and rethrows when an empty-scope block raises InvalidForeignKey", async () => {
    const { host } = makeHost(["a", "b"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fkError = new InvalidForeignKey("boom", { sql: "", binds: [] });
    try {
      await expect(
        disableReferentialIntegrity.call(host, async () => {
          throw fkError;
        }, []),
      ).rejects.toBe(fkError);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it("swallows an enable-pass StatementInvalid when the block dropped a snapshotted table", async () => {
    const host: FakeHost = {
      quoteTableName: (name) => `"${name}"`,
      // Mirrors the adapter translating undefined_table (42P01) to
      // StatementInvalid (an ActiveRecordError) — the enable-pass catch must
      // swallow it rather than let it escape disableReferentialIntegrity.
      execute: async (sql) => {
        if (sql.includes("ENABLE TRIGGER ALL")) {
          throw new StatementInvalid('relation "gone" does not exist', { sql, binds: [] });
        }
        return [];
      },
      tables: async () => ["gone"],
      transaction: async (fn) => fn(),
    };

    await expect(disableReferentialIntegrity.call(host, async () => {})).resolves.toBeUndefined();
  });
});
