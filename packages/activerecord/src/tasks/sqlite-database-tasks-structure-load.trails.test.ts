import { describe, it, expect, afterEach } from "vitest";
import { getChildProcess } from "@blazetrails/ruby-compat";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

describe("SQLiteDatabaseTasks structure_load input redirect", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  it("feeds the dump's bytes to sqlite3 verbatim", async () => {
    const database = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sqlite3`);
    const filename = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sql`);
    created.push(database, filename);

    fs.writeFileSync(
      filename,
      Buffer.concat([
        Buffer.from("CREATE TABLE t (a);\nINSERT INTO t VALUES ('"),
        Buffer.from([0xff]),
        Buffer.from("');\n"),
      ]),
    );

    const configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    await new SQLiteDatabaseTasks(configuration).structureLoad(filename);

    const result = getChildProcess().spawnSync("sqlite3", [database, "SELECT hex(a) FROM t;"]);
    expect(result.stdout.trim()).toBe("FF");
  });
});
