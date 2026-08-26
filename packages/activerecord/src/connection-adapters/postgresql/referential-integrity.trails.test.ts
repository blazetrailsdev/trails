/**
 * Adapter-agnostic regression tests for disableReferentialIntegrity.
 *
 * These drive the module function against a fake host (no live PG), pinning the
 * shape of referential_integrity.rb:7-38 — each ALTER pass collects `tables`
 * itself, and the enable pass swallows an ActiveRecordError. The live-PG
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
  it("collects the table list in each pass", async () => {
    const { host, tablesCalls } = makeHost(["a", "b"]);
    await disableReferentialIntegrity.call(host, async () => {});
    expect(tablesCalls()).toBe(2);
  });

  it("enables the tables the catalog holds once the block has run", async () => {
    let current = ["a", "b"];
    const executed: string[] = [];
    const host: FakeHost = {
      quoteTableName: (name) => `"${name}"`,
      execute: async (sql) => {
        executed.push(sql);
        return [];
      },
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
    expect(enableSql).toBe(
      `ALTER TABLE "a" ENABLE TRIGGER ALL;ALTER TABLE "b" ENABLE TRIGGER ALL;ALTER TABLE "c" ENABLE TRIGGER ALL`,
    );
  });

  it("runs the block when the catalog is empty", async () => {
    const { host, executed } = makeHost([]);
    let ran = false;
    await disableReferentialIntegrity.call(host, async () => {
      ran = true;
    });
    expect(ran).toBe(true);
    expect(executed).toEqual(["", ""]);
  });

  it("still warns and rethrows when the block raises InvalidForeignKey", async () => {
    const { host } = makeHost(["a", "b"]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fkError = new InvalidForeignKey("boom", { sql: "", binds: [] });
    try {
      await expect(
        disableReferentialIntegrity.call(host, async () => {
          throw fkError;
        }),
      ).rejects.toBe(fkError);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it("swallows an enable-pass StatementInvalid raised against a missing table", async () => {
    const host: FakeHost = {
      quoteTableName: (name) => `"${name}"`,
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
