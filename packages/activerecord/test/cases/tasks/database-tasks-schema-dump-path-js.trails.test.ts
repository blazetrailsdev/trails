import { afterEach, describe, expect, it } from "vitest";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { DatabaseTasks } from "../../../lib/tasks/database-tasks.js";
import { HashConfig } from "../../../lib/database-configurations/hash-config.js";

describe("DatabaseTasks.schemaDumpPath in a compiled tree", () => {
  let tmp: string;
  afterEach(() => FileUtils.rmRf(tmp));

  it("answers schema.ts even where only schema.js exists, so a dump never writes TS into it", () => {
    tmp = Dir.mktmpdir("schema_dump_path_js");
    const dbConfig = new HashConfig("development", "primary", { adapter: "sqlite3" });

    stub(DatabaseTasks, "dbDir", tmp, undefined, () => {
      expect(DatabaseTasks.schemaDumpPath(dbConfig, "ts")).toBe(`${tmp}/schema.ts`);
      File.write(`${tmp}/schema.js`, "");
      expect(DatabaseTasks.schemaDumpPath(dbConfig, "ts")).toBe(`${tmp}/schema.ts`);
    });
  });

  it("loadSchema loads schema.js where only schema.js exists", async () => {
    tmp = Dir.mktmpdir("load_schema_js");
    const dbConfig = new HashConfig("development", "primary", { adapter: "sqlite3" });
    const loads = ((globalThis as { __schemaJsLoads?: string[] }).__schemaJsLoads = []);
    File.write(`${tmp}/schema.js`, "globalThis.__schemaJsLoads.push('schema.js');\n");
    const pool = { internalMetadata: { createTableAndSetFlags: async () => undefined } };

    await stub(DatabaseTasks, "dbDir", tmp, undefined, () =>
      stub(
        DatabaseTasks,
        "migrationConnectionPool",
        () => pool,
        undefined,
        () => DatabaseTasks.loadSchema(dbConfig, "ts"),
      ),
    );

    expect(loads).toEqual(["schema.js"]);
  });
});
