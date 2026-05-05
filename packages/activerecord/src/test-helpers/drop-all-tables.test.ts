import { describe, it, expect, beforeAll } from "vitest";
import { createTestAdapter } from "../test-adapter.js";
import { dropAllTables } from "./drop-all-tables.js";
import type { DatabaseAdapter } from "../adapter.js";

// Bypass SchemaAdapter.setup() by using the raw inner adapter directly.
let adapter: DatabaseAdapter;

async function tableCount(a: DatabaseAdapter): Promise<number> {
  if (a.adapterName === "sqlite") {
    return (
      (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
      )) as unknown[]
    ).length;
  } else if (a.adapterName === "postgres") {
    return (
      (await a.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false))`,
      )) as unknown[]
    ).length;
  } else {
    return (
      (await a.execute(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
      )) as unknown[]
    ).length;
  }
}

beforeAll(() => {
  const sa = createTestAdapter();

  adapter = (sa as any).inner ?? sa;
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
