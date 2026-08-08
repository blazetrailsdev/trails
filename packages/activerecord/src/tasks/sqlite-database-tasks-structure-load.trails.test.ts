import { describe, it, expect, afterEach } from "vitest";
import * as activesupport from "@blazetrails/activesupport";
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
      } catch {
        // ignore
      }
    }
    created.length = 0;
  });

  it("feeds the dump's bytes to sqlite3 verbatim", async () => {
    const database = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sqlite3`);
    const filename = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sql`);
    created.push(database, filename);

    // 0xFF is not valid UTF-8: buffering the dump through a JS string replaces
    // it with U+FFFD (ef bf bd) before sqlite3 ever sees it.
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

    const result = activesupport
      .getChildProcess()
      .spawnSync("sqlite3", [database, "SELECT hex(a) FROM t;"]);
    expect(result.stdout.trim()).toBe("FF");
  });
});
