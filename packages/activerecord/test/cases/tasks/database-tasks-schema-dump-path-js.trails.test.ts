import { afterEach, describe, expect, it } from "vitest";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { Dir, File, FileUtils } from "@blazetrails/ruby-compat";
import { DatabaseTasks } from "../../../lib/tasks/database-tasks.js";
import { HashConfig } from "../../../lib/database-configurations/hash-config.js";

describe("DatabaseTasks.schemaDumpPath in a compiled tree", () => {
  let tmp: string;
  afterEach(() => FileUtils.rmRf(tmp));

  it("answers schema.js when only schema.js exists, and schema.ts otherwise", () => {
    tmp = Dir.mktmpdir("schema_dump_path_js");
    const dbConfig = new HashConfig("development", "primary", { adapter: "sqlite3" });

    stub(DatabaseTasks, "dbDir", tmp, undefined, () => {
      expect(DatabaseTasks.schemaDumpPath(dbConfig, "ts")).toBe(`${tmp}/schema.ts`);
      File.write(`${tmp}/schema.js`, "");
      expect(DatabaseTasks.schemaDumpPath(dbConfig, "ts")).toBe(`${tmp}/schema.js`);
      File.write(`${tmp}/schema.ts`, "");
      expect(DatabaseTasks.schemaDumpPath(dbConfig, "ts")).toBe(`${tmp}/schema.ts`);
    });
  });
});
