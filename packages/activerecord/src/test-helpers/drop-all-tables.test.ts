import { describe, it, expect, beforeAll } from "vitest";
import { createTestAdapter } from "../test-adapter.js";
import { dropAllTables } from "./drop-all-tables.js";
import type { DatabaseAdapter } from "../adapter.js";

// Bypass SchemaAdapter.setup() by using the raw inner adapter directly.
let adapter: DatabaseAdapter;

async function tableCount(a: DatabaseAdapter): Promise<number> {
  if (a.adapterName === "sqlite") {
    const rows = (await a.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )) as { name: string }[];
    return rows.length;
  } else if (a.adapterName === "postgres") {
    const rows = (await a.execute(
      `SELECT tablename FROM pg_tables WHERE schemaname = ANY(current_schemas(false))`,
    )) as { tablename: string }[];
    return rows.length;
  } else {
    const rows = (await a.execute(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    )) as { table_name: string }[];
    return rows.length;
  }
}

beforeAll(() => {
  adapter = (createTestAdapter() as any).inner ?? createTestAdapter();
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

  it("drops FK chain in correct order (grandchild → child → parent)", async () => {
    if (adapter.adapterName === "sqlite") {
      await adapter.executeMutation(`CREATE TABLE fk_parent (id INTEGER PRIMARY KEY)`);
      await adapter.executeMutation(
        `CREATE TABLE fk_child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES fk_parent(id))`,
      );
      await adapter.executeMutation(
        `CREATE TABLE fk_grandchild (id INTEGER PRIMARY KEY, child_id INTEGER REFERENCES fk_child(id))`,
      );
    } else if (adapter.adapterName === "postgres") {
      await adapter.executeMutation(`CREATE TABLE fk_parent (id SERIAL PRIMARY KEY)`);
      await adapter.executeMutation(
        `CREATE TABLE fk_child (id SERIAL PRIMARY KEY, parent_id INTEGER REFERENCES fk_parent(id))`,
      );
      await adapter.executeMutation(
        `CREATE TABLE fk_grandchild (id SERIAL PRIMARY KEY, child_id INTEGER REFERENCES fk_child(id))`,
      );
    } else {
      await adapter.executeMutation(`CREATE TABLE fk_parent (id INT PRIMARY KEY)`);
      await adapter.executeMutation(
        `CREATE TABLE fk_child (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES fk_parent(id))`,
      );
      await adapter.executeMutation(
        `CREATE TABLE fk_grandchild (id INT PRIMARY KEY, child_id INT, FOREIGN KEY (child_id) REFERENCES fk_child(id))`,
      );
    }
    await dropAllTables(adapter);
    expect(await tableCount(adapter)).toBe(0);
  });
});
