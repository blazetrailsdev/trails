import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Base } from "../base.js";
import { SchemaDumper } from "../schema-dumper.js";
import {
  dumpAllTableSchema,
  dumpTableSchema,
  FULL_DUMP_TIMEOUT_MS,
} from "./schema-dumping-helper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

let adapter: DatabaseAdapter;

beforeAll(async () => {
  adapter = await Base.leaseConnection();
});

const createdTables = new Set<string>();
async function createSdhTable(name: string, columns = "id INTEGER PRIMARY KEY"): Promise<void> {
  createdTables.add(name);
  await adapter.execute(`CREATE TABLE ${name} (${columns})`);
}

describe("SchemaDumpingHelper", () => {
  afterEach(async () => {
    for (const t of createdTables) {
      await adapter.execute(`DROP TABLE IF EXISTS ${adapter.quoteTableName(t)}`);
    }
    createdTables.clear();
  });

  it("dumps only the named table", async () => {
    await createSdhTable("sdh_kept", "id INTEGER PRIMARY KEY, name varchar(255)");
    await createSdhTable("sdh_other");

    const output = await dumpTableSchema(adapter, "sdh_kept");

    expect(output).toContain("sdh_kept");
    expect(output).not.toContain("sdh_other");
  });

  it("dumps multiple named tables and excludes the rest", async () => {
    await createSdhTable("sdh_a");
    await createSdhTable("sdh_b");
    await createSdhTable("sdh_c");

    const output = await dumpTableSchema(adapter, "sdh_a", "sdh_c");

    expect(output).toContain("sdh_a");
    expect(output).toContain("sdh_c");
    expect(output).not.toContain("sdh_b");
  });

  it("restores SchemaDumper.ignoreTables after the dump", async () => {
    await createSdhTable("sdh_kept");
    const before = SchemaDumper.ignoreTables;

    await dumpTableSchema(adapter, "sdh_kept");

    expect(SchemaDumper.ignoreTables).toBe(before);
  });

  it("restores SchemaDumper.ignoreTables even when the dump throws", async () => {
    const before = SchemaDumper.ignoreTables;
    const boom = new Error("boom");
    await createSdhTable("sdh_kept");
    const columns = vi.spyOn(adapter, "columns").mockRejectedValue(boom);

    await expect(dumpTableSchema(adapter, "sdh_kept")).rejects.toThrow(boom);
    columns.mockRestore();
    expect(SchemaDumper.ignoreTables).toBe(before);
  });

  it("dumpAllTableSchema honors the ignore list", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    await createSdhTable("sdh_keep");
    await createSdhTable("sdh_skip");

    const output = await dumpAllTableSchema(["sdh_skip"]);

    expect(output).toContain("sdh_keep");
    expect(output).not.toContain("sdh_skip");
  });
});
