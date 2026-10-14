import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { Base, Migration, TableDefinition } from "./index.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-helpers/use-fixtures.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("ActiveRecordSchemaTest (trails)", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: DatabaseAdapter;
  let originalVerbose: boolean | undefined;

  beforeEach(async () => {
    originalVerbose = Migration.verbose;
    Migration.verbose = false;
    adapter = await Base.leaseConnection();
  });

  afterEach(async () => {
    await adapter.dropTable("ts_opts", { ifExists: true });
    Migration.verbose = originalVerbose;
  });

  it("timestamps with custom options on create table", async () => {
    const td = new TableDefinition(adapter, "ts_custom");
    td.timestamps({ null: true, precision: 6 });
    const createdAt = td.columns.find((c) => c.name === "created_at");
    const updatedAt = td.columns.find((c) => c.name === "updated_at");
    expect(createdAt!.options.null).toBe(true);
    expect(createdAt!.options.precision).toBe(6);
    expect(updatedAt!.options.null).toBe(true);
    expect(updatedAt!.options.precision).toBe(6);
  });

  it("addTimestamps forwards options to addColumn", async () => {
    class TsOptMig extends Migration.Current {
      async up() {
        await this.createTable("ts_opts", (t) => {
          t.string("name");
        });
        await this.addTimestamps("ts_opts", { null: true });
      }
      async down() {
        await this.dropTable("ts_opts");
      }
    }
    const m = new TsOptMig();
    m.connection = adapter;
    await m.up();
    await adapter.execute(`INSERT INTO ts_opts (name) VALUES ('test')`);
    const rows = (await adapter.selectAll(`SELECT * FROM ts_opts`)).toArray();
    expect(rows.length).toBe(1);
    expect(rows[0].created_at).toBeNull();
    expect(rows[0].updated_at).toBeNull();
  });
});
