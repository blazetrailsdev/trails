import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { SchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { skipGlobalResetForFile } from "./skip-global-reset.js";
import {
  dumpAllTableSchema,
  dumpTableSchema,
  FULL_DUMP_TIMEOUT_MS,
} from "./schema-dumping-helper.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

let adapter: DatabaseAdapter;

skipGlobalResetForFile();

beforeAll(() => {
  adapter = Base.adapter;
});

// Track the bespoke `sdh_*` tables each test creates so afterEach can drop
// exactly those. This suite runs under skipGlobalResetForFile(), so nothing
// clears these between tests in-file — one
// test reuses `sdh_kept` and would hit "table already exists" if left. Dropping
// only the created tables (RFC 0060) replaces the old afterAll/afterEach
// dropAllTables' ~330-table canonical DROP fan-out; any leak past the file is
// swept by the next non-skip file's `resetTestTables`. Deriving the drop set
// from `createSdhTable` (rather than a hand-maintained list) keeps it correct
// as tests are added or renamed.
const createdTables = new Set<string>();
async function createSdhTable(name: string, columns = "id INTEGER PRIMARY KEY"): Promise<void> {
  createdTables.add(name);
  await adapter.executeMutation(`CREATE TABLE ${name} (${columns})`);
}

describe("SchemaDumpingHelper", () => {
  afterEach(async () => {
    for (const t of createdTables) {
      await adapter.executeMutation(`DROP TABLE IF EXISTS ${adapter.quoteTableName(t)}`);
    }
    createdTables.clear();
  });

  it("dumps only the named table", async () => {
    await createSdhTable("sdh_kept", "id INTEGER PRIMARY KEY, name varchar(255)");
    await createSdhTable("sdh_other");

    const output = await dumpTableSchema(adapter as unknown as SchemaSource, "sdh_kept");

    expect(output).toContain("sdh_kept");
    expect(output).not.toContain("sdh_other");
  });

  it("dumps multiple named tables and excludes the rest", async () => {
    await createSdhTable("sdh_a");
    await createSdhTable("sdh_b");
    await createSdhTable("sdh_c");

    const output = await dumpTableSchema(adapter as unknown as SchemaSource, "sdh_a", "sdh_c");

    expect(output).toContain("sdh_a");
    expect(output).toContain("sdh_c");
    expect(output).not.toContain("sdh_b");
  });

  it("restores SchemaDumper.ignoreTables after the dump", async () => {
    await createSdhTable("sdh_kept");
    const before = SchemaDumper.ignoreTables;

    await dumpTableSchema(adapter as unknown as SchemaSource, "sdh_kept");

    expect(SchemaDumper.ignoreTables).toBe(before);
  });

  it("restores SchemaDumper.ignoreTables even when the dump throws", async () => {
    const before = SchemaDumper.ignoreTables;
    const boom = new Error("boom");
    const failing = {
      tables: async () => ["sdh_kept"],
      columns: async () => {
        throw boom;
      },
      indexes: async () => [],
    } as unknown as SchemaSource;

    await expect(dumpTableSchema(failing, "sdh_kept")).rejects.toThrow(boom);
    expect(SchemaDumper.ignoreTables).toBe(before);
  });

  it("dumpAllTableSchema honors the ignore list", { timeout: FULL_DUMP_TIMEOUT_MS }, async () => {
    await createSdhTable("sdh_keep");
    await createSdhTable("sdh_skip");

    const output = await dumpAllTableSchema(adapter as unknown as SchemaSource, ["sdh_skip"]);

    expect(output).toContain("sdh_keep");
    expect(output).not.toContain("sdh_skip");
  });
});
