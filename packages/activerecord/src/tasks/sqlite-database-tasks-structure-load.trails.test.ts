import { describe, it, expect, afterEach, vi } from "vitest";
import { getChildProcess, getChildProcessAsync } from "@blazetrails/ruby-compat";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";

describe("SQLiteDatabaseTasks structure_load input redirect", () => {
  const created: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("passes the flags as the shell would split them, and none for an empty list", async () => {
    const database = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sqlite3`);
    const filename = path.join(os.tmpdir(), `trails-structure-load-${randomUUID()}.sql`);
    created.push(database, filename);
    fs.writeFileSync(filename, "");
    const tasks = new SQLiteDatabaseTasks(
      new HashConfig("development", "primary", { adapter: "sqlite3", database }),
    );
    const spawnSync = vi.spyOn(await getChildProcessAsync(), "spawnSync");

    await tasks.structureLoad(filename, []);
    await tasks.structureLoad(filename, ["--bail", "", "--batch"]);
    await tasks.structureLoad(filename, null);

    expect(spawnSync.mock.calls.map(([, args]) => args)).toEqual([
      [database],
      ["--bail", "--batch", database],
      [database],
    ]);
  });
});
