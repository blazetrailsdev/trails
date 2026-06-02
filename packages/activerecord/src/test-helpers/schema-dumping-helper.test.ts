import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Base } from "../base.js";
import { SchemaDumper } from "../schema-dumper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { dropAllTables } from "./drop-all-tables.js";
import { dumpAllTableSchema, dumpTableSchema } from "./schema-dumping-helper.js";
import type { DatabaseAdapter } from "../adapter.js";

let adapter: DatabaseAdapter;

setupHandlerSuite();

beforeAll(() => {
  adapter = Base.adapter;
});

describe("SchemaDumpingHelper", () => {
  afterEach(async () => {
    await dropAllTables(adapter);
  });

  it("dumps only the named table", async () => {
    await adapter.executeMutation(
      `CREATE TABLE sdh_kept (id INTEGER PRIMARY KEY, name varchar(255))`,
    );
    await adapter.executeMutation(`CREATE TABLE sdh_other (id INTEGER PRIMARY KEY)`);

    const output = await dumpTableSchema(adapter as unknown as SchemaSource, "sdh_kept");

    expect(output).toContain("sdh_kept");
    expect(output).not.toContain("sdh_other");
  });

  it("dumps multiple named tables and excludes the rest", async () => {
    await adapter.executeMutation(`CREATE TABLE sdh_a (id INTEGER PRIMARY KEY)`);
    await adapter.executeMutation(`CREATE TABLE sdh_b (id INTEGER PRIMARY KEY)`);
    await adapter.executeMutation(`CREATE TABLE sdh_c (id INTEGER PRIMARY KEY)`);

    const output = await dumpTableSchema(adapter as unknown as SchemaSource, "sdh_a", "sdh_c");

    expect(output).toContain("sdh_a");
    expect(output).toContain("sdh_c");
    expect(output).not.toContain("sdh_b");
  });

  it("restores SchemaDumper.ignoreTables after the dump", async () => {
    await adapter.executeMutation(`CREATE TABLE sdh_kept (id INTEGER PRIMARY KEY)`);
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

  it("dumpAllTableSchema honors the ignore list", async () => {
    await adapter.executeMutation(`CREATE TABLE sdh_keep (id INTEGER PRIMARY KEY)`);
    await adapter.executeMutation(`CREATE TABLE sdh_skip (id INTEGER PRIMARY KEY)`);

    const output = await dumpAllTableSchema(adapter as unknown as SchemaSource, ["sdh_skip"]);

    expect(output).toContain("sdh_keep");
    expect(output).not.toContain("sdh_skip");
  });
});
