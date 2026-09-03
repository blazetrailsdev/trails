import { it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { getChildProcess } from "@blazetrails/ruby-compat";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { SQLiteDatabaseTasks } from "../../tasks/sqlite-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base } from "../../base.js";

describeIfSqlite("SqliteStructureDumpTest", () => {
  const created: string[] = [];
  let database: string;
  let configuration: HashConfig;
  let previous: ReturnType<typeof Base.removeConnection>;

  beforeEach(async () => {
    database = path.join(os.tmpdir(), `db_create-${randomUUID()}.sqlite3`);
    created.push(database);
    for (const table of ["bar", "prefix_foo", "prefix_bar"]) {
      const result = getChildProcess().spawnSync("sqlite3", [
        database,
        `CREATE TABLE ${table}(id INTEGER)`,
      ]);
      if (result.status !== 0) throw new Error(`sqlite3 failed: ${result.stderr}`);
    }
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    previous = Base.removeConnection();
    await Base.establishConnection({ adapter: "sqlite3", database });
  });

  afterEach(async () => {
    SchemaDumper.ignoreTables = [];
    Base.removeConnection();
    if (previous) await Base.establishConnection(previous.configuration);
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  it("ignores every match of a global ignore_tables pattern", async () => {
    const filename = path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
    created.push(filename);
    SchemaDumper.ignoreTables = [/^prefix_/g];

    await new SQLiteDatabaseTasks(configuration).structureDump(filename);

    const contents = fs.readFileSync(filename, "utf8");
    expect(contents).not.toMatch(/prefix_bar/);
    expect(contents).not.toMatch(/prefix_foo/);
  });
});
