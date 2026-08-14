import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

// `readBigInts` is statement-wide, so a SELECT touching one BIGINT column also
// widens every INTEGER column of the same row. The narrowing that undoes that
// spill lives in the single `performQuery` reader arm, which every read path
// funnels through — `execQuery`/`internalExecQuery`, `execute`, `rawExecute`,
// and the `loadAsync` FutureResult path. Before, only `internalExecQuery`
// narrowed, so the same SELECT answered `number` one way and `bigint` the other.
describe("SQLite3Adapter bigint narrowing", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "trails-sqlite-bignarrow-"));
    adapter = new BetterSQLite3Adapter(path.join(tmpDir, "db.sqlite3"));
    await adapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, wide BIGINT, narrow INTEGER)",
    );
    await adapter.executeMutation("INSERT INTO widgets (id, wide, narrow) VALUES (1, 7, 2)");
  });

  afterEach(async () => {
    await adapter.dropTable("widgets", { ifExists: true });
    await adapter.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("narrows spilled bigints identically through execQuery and execute", async () => {
    const sql = "SELECT id, wide, narrow FROM widgets";
    const viaExecQuery = (await adapter.execQuery(sql)).toArray()[0];
    const viaExecute = (await adapter.execute(sql))[0];

    expect(typeof viaExecQuery.narrow).toBe("number");
    expect(typeof viaExecute.narrow).toBe("number");
    expect(typeof viaExecQuery.id).toBe("number");
    expect(typeof viaExecute.id).toBe("number");
    // The bigint-declared column keeps the wide value on both paths.
    expect(typeof viaExecQuery.wide).toBe("bigint");
    expect(typeof viaExecute.wide).toBe("bigint");
    expect(viaExecute).toEqual(viaExecQuery);
  });

  it("narrows spilled bigints through rawExecute", async () => {
    const result = (await adapter.rawExecute("SELECT id, wide, narrow FROM widgets")) as {
      toArray(): Record<string, unknown>[];
    };
    const row = result.toArray()[0];
    expect(typeof row.id).toBe("number");
    expect(typeof row.narrow).toBe("number");
  });
});
