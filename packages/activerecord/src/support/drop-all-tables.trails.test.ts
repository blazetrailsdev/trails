import { afterEach, describe, it, expect, beforeAll, vi } from "vitest";
import { Base } from "../base.js";
import { dropAllTables, purgeToCanonicalTables, resetTestTables } from "./drop-all-tables.js";
import { provisionSecondDatabase } from "./setup-second-pool.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
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
        return [];
      }),
      executeMutation: vi.fn(async () => {}),
      schemaCache: { clearBang() {} },
    } as unknown as DatabaseAdapter;

    await expect(dropAllTables(fakeAdapter)).resolves.toBeUndefined();
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
      schemaCache: { clearBang() {} },
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
        if (sql.includes("matviewname")) {
          return mutationCallCount === 0 ? [{ schemaname: "public", name: "mv1" }] : [];
        }
        return [];
      }),
      executeMutation: vi.fn(async () => {
        mutationCallCount++;
        if (mutationCallCount === 1) throw connErr;
      }),
      schemaCache: { clearBang() {} },
    } as unknown as DatabaseAdapter;

    await expect(dropAllTables(fakeAdapter)).resolves.toBeUndefined();
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

    expect(await listTables(adapter)).toContain("articles");
    expect(((await adapter.execute(`SELECT id FROM articles`)) as unknown[]).length).toBe(0);
  });

  it("drops bespoke (non-canonical) tables so their shape can't leak", async () => {
    await adapter.executeMutation(`CREATE TABLE bespoke_reset_t (id INTEGER PRIMARY KEY)`);
    expect(await listTables(adapter)).toContain("bespoke_reset_t");

    await resetTestTables(adapter);

    expect(await listTables(adapter)).not.toContain("bespoke_reset_t");
    expect(await listTables(adapter)).toContain("articles");
  });

  it("drops bookkeeping tables (schema_migrations / ar_internal_metadata) like the old drop-all", async () => {
    await adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY)`,
    );

    await resetTestTables(adapter);

    expect(await listTables(adapter)).not.toContain("schema_migrations");
  });
});

describe("dropAllTables", () => {
  let dropAdapter: DatabaseAdapter;

  beforeAll(async () => {
    dropAdapter = await ARUnit2Model.leaseConnection();
  });

  afterEach(provisionSecondDatabase);

  it("drops all tables", async () => {
    expect(await tableCount(dropAdapter)).toBeGreaterThan(0);
    await dropAllTables(dropAdapter);
    expect(await tableCount(dropAdapter)).toBe(0);
  });

  it("is idempotent — second call is a no-op", async () => {
    await dropAllTables(dropAdapter);
    await dropAllTables(dropAdapter);
    expect(await tableCount(dropAdapter)).toBe(0);
  });

  it("drops 3-table FK chain without error", async () => {
    const int = dropAdapter.adapterName === "mysql2" ? "INT" : "INTEGER";
    await dropAdapter.executeMutation(`CREATE TABLE fk_parent (id ${int} PRIMARY KEY)`);
    await dropAdapter.executeMutation(
      `CREATE TABLE fk_child (id ${int} PRIMARY KEY, parent_id ${int}, FOREIGN KEY (parent_id) REFERENCES fk_parent(id))`,
    );
    await dropAdapter.executeMutation(
      `CREATE TABLE fk_grandchild (id ${int} PRIMARY KEY, child_id ${int}, FOREIGN KEY (child_id) REFERENCES fk_child(id))`,
    );
    await dropAdapter.executeMutation(`INSERT INTO fk_parent (id) VALUES (1)`);
    await dropAdapter.executeMutation(`INSERT INTO fk_child (id, parent_id) VALUES (1, 1)`);
    await dropAdapter.executeMutation(`INSERT INTO fk_grandchild (id, child_id) VALUES (1, 1)`);
    await dropAllTables(dropAdapter);
    expect(await tableCount(dropAdapter)).toBe(0);
  });
});

describe("dropAllTables (shared worker database)", () => {
  it("leaves the shared canonical schema intact", async () => {
    const tables = await listTables(adapter);
    expect(tables.length).toBeGreaterThan(0);
    expect(tables).toContain("items");
    expect(tables).toContain("posts");
  });
});

/**
 * The pre-snapshot path is purge-only by construction: it protects the canonical
 * `schema.rb` half and nothing else, so the adapter-specific tables it drops are
 * the caller's to re-lay. These cover the two ways that contract can be broken
 * silently — a `reset` reaching the pre-snapshot path without meaning to, and
 * the `test-setup-dy.ts` boot order flipping so the arm runs before the purge.
 */
describe("purge-only pre-snapshot path", () => {
  async function freshModules(): Promise<{
    dropAllTablesModule: typeof import("./drop-all-tables.js");
    loadSchemaHelper: typeof import("./load-schema-helper.js");
  }> {
    vi.resetModules();
    const dropAllTablesModule = await import("./drop-all-tables.js");
    const loadSchemaHelper = await import("./load-schema-helper.js");
    return { dropAllTablesModule, loadSchemaHelper };
  }

  const inertAdapter = {
    adapterName: "none",
    schemaCache: { clearBang() {} },
  } as unknown as DatabaseAdapter;

  const armOnlyAdapter = {
    adapterName: "sqlite",
    createTable: async () => {},
  } as unknown as DatabaseAdapter;

  it("rejects a reset that runs before the boot-laid snapshot", async () => {
    const { dropAllTablesModule } = await freshModules();

    await expect(dropAllTablesModule.resetTestTables(inertAdapter)).rejects.toThrow(
      /before recordBootLaidTables/,
    );
  });

  it("rejects a purge that runs after the adapter-specific arm", async () => {
    const { dropAllTablesModule, loadSchemaHelper } = await freshModules();
    await loadSchemaHelper.loadAdapterSpecificSchema(armOnlyAdapter);

    await expect(dropAllTablesModule.purgeToCanonicalTables(inertAdapter)).rejects.toThrow(
      /after the adapter-specific schema arm/,
    );
  });

  it("leaves the purge available on an adapter that has no arm to run", async () => {
    const { dropAllTablesModule, loadSchemaHelper } = await freshModules();
    await loadSchemaHelper.loadAdapterSpecificSchema(inertAdapter);

    await expect(dropAllTablesModule.purgeToCanonicalTables(inertAdapter)).resolves.toBeUndefined();
  });

  it("allows the purge after the arm when the caller names the tables it laid", async () => {
    const { dropAllTablesModule, loadSchemaHelper } = await freshModules();
    await loadSchemaHelper.loadAdapterSpecificSchema(armOnlyAdapter);

    await expect(
      dropAllTablesModule.purgeToCanonicalTables(inertAdapter, ["defaults"]),
    ).resolves.toBeUndefined();
  });

  it("rejects a purge that runs after the boot-laid snapshot", async () => {
    await expect(purgeToCanonicalTables(adapter)).rejects.toThrow(/after recordBootLaidTables/);
  });

  it("truncates a named adapter-specific table instead of dropping it", async () => {
    const { dropAllTablesModule } = await freshModules();

    await dropAllTablesModule.purgeToCanonicalTables(adapter, ["defaults"]);

    expect(await listTables(adapter)).toContain("defaults");
  });

  it("clears the rows of a canonical table, so the boot needs no truncate ahead of it", async () => {
    const { dropAllTablesModule } = await freshModules();
    await adapter.executeMutation(`INSERT INTO articles (id) VALUES (4243)`);
    expect(((await adapter.execute(`SELECT id FROM articles`)) as unknown[]).length).toBe(1);

    await dropAllTablesModule.purgeToCanonicalTables(adapter);

    expect(((await adapter.execute(`SELECT id FROM articles`)) as unknown[]).length).toBe(0);
  });
});
