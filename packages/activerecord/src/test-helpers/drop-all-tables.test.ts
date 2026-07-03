import { afterEach, describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "../base.js";
import { setupFixtures } from "./fixtures.js";
import { dropAllTables, resetTestTables } from "./drop-all-tables.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

let adapter: DatabaseAdapter;

async function listTables(a: DatabaseAdapter): Promise<string[]> {
  if (a.adapterName === "sqlite") {
    return (
      (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )) as Array<{ name: string }>
    ).map((r) => r.name);
  } else if (a.adapterName === "postgres") {
    return (
      (await a.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false))`,
      )) as Array<{ tablename: string }>
    ).map((r) => r.tablename);
  } else {
    return (
      (await a.execute(
        `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
      )) as Array<{ name?: string; TABLE_NAME?: string }>
    ).map((r) => (r.name ?? r.TABLE_NAME)!);
  }
}

async function tableCount(a: DatabaseAdapter): Promise<number> {
  return (await listTables(a)).length;
}

setupFixtures();

beforeAll(() => {
  adapter = Base.adapter;
});

describe("dropAllTables (PG connection-error retry, fake adapter)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("retries exactly once when execute throws a connection error and succeeds on retry", async () => {
    const connErr = Object.assign(new Error("Connection terminated unexpectedly"), {
      code: "08006",
    });

    let executeCallCount = 0;
    const fakeAdapter = {
      adapterName: "postgres" as const,
      execute: vi.fn(async () => {
        executeCallCount++;
        if (executeCallCount === 1) throw connErr;
        // Second call (retry): return empty table list so no DROPs run.
        return [];
      }),
      executeMutation: vi.fn(async () => {}),
    } as unknown as DatabaseAdapter;

    await expect(dropAllTables(fakeAdapter)).resolves.toBeUndefined();
    // First attempt: 1 execute call throws. Retry: 3 execute calls (matviews,
    // views, tables) all return []. Total = 4.
    expect(executeCallCount).toBe(4);
  });

  it("rethrows when execute throws a non-connection error", async () => {
    const appErr = new Error("syntax error");
    const fakeAdapter = {
      adapterName: "postgres" as const,
      execute: vi.fn(async () => {
        throw appErr;
      }),
      executeMutation: vi.fn(async () => {}),
    } as unknown as DatabaseAdapter;

    await expect(dropAllTables(fakeAdapter)).rejects.toThrow(appErr);
    expect(fakeAdapter.execute).toHaveBeenCalledTimes(1);
  });

  it("retries when executeMutation throws a connection error mid-loop", async () => {
    const connErr = Object.assign(new Error("invalid frontend message type 0"), {
      code: "08P01",
    });

    let mutationCallCount = 0;
    const fakeAdapter = {
      adapterName: "postgres" as const,
      execute: vi.fn(async (sql: string) => {
        // Return one matview on first pass; empty on retry.
        if (sql.includes("matviewname")) {
          return mutationCallCount === 0 ? [{ schemaname: "public", name: "mv1" }] : [];
        }
        return [];
      }),
      executeMutation: vi.fn(async () => {
        mutationCallCount++;
        if (mutationCallCount === 1) throw connErr;
      }),
    } as unknown as DatabaseAdapter;

    await expect(dropAllTables(fakeAdapter)).resolves.toBeUndefined();
    // First pass: 1 execute (matviews→mv1) + 1 executeMutation (throws).
    // Retry: 3 execute calls (matviews/views/tables → all empty) + 0 mutations.
    // Total execute calls = 4 proves the retry path ran.
    expect(fakeAdapter.execute).toHaveBeenCalledTimes(4);
    expect(mutationCallCount).toBe(1);
  });
});

describe("resetTestTables", () => {
  it("truncates canonical tables (keeps shape) instead of dropping them", async () => {
    await adapter.executeMutation(`INSERT INTO articles (id) VALUES (4242)`);
    expect(
      ((await adapter.execute(`SELECT id FROM articles`)) as unknown[]).length,
    ).toBeGreaterThan(0);

    await resetTestTables(adapter);

    // Canonical table survives (not dropped)...
    expect(await listTables(adapter)).toContain("articles");
    // ...but its rows are cleared.
    expect(((await adapter.execute(`SELECT id FROM articles`)) as unknown[]).length).toBe(0);
  });

  it("drops bespoke (non-canonical) tables so their shape can't leak", async () => {
    await adapter.executeMutation(`CREATE TABLE bespoke_reset_t (id INTEGER PRIMARY KEY)`);
    expect(await listTables(adapter)).toContain("bespoke_reset_t");

    await resetTestTables(adapter);

    expect(await listTables(adapter)).not.toContain("bespoke_reset_t");
    // Canonical tables are still present after the bespoke drop.
    expect(await listTables(adapter)).toContain("articles");
  });
});

describe("dropAllTables", () => {
  it("drops all tables", async () => {
    await adapter.executeMutation(`CREATE TABLE drop_t1 (id INTEGER PRIMARY KEY)`);
    await adapter.executeMutation(`CREATE TABLE drop_t2 (id INTEGER PRIMARY KEY)`);
    await adapter.executeMutation(`CREATE TABLE drop_t3 (id INTEGER PRIMARY KEY)`);
    await dropAllTables(adapter);
    expect(await tableCount(adapter)).toBe(0);
  });

  it("is idempotent — second call is a no-op", async () => {
    await dropAllTables(adapter);
    await dropAllTables(adapter);
    expect(await tableCount(adapter)).toBe(0);
  });

  it("drops 3-table FK chain without error", async () => {
    const int = adapter.adapterName === "mysql" ? "INT" : "INTEGER";
    await adapter.executeMutation(`CREATE TABLE fk_parent (id ${int} PRIMARY KEY)`);
    await adapter.executeMutation(
      `CREATE TABLE fk_child (id ${int} PRIMARY KEY, parent_id ${int})`,
    );
    await adapter.executeMutation(
      `CREATE TABLE fk_grandchild (id ${int} PRIMARY KEY, child_id ${int})`,
    );
    await dropAllTables(adapter);
    expect(await tableCount(adapter)).toBe(0);
  });
});
