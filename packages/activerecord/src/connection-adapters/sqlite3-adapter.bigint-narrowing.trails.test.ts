import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

describe("SQLite3Adapter bigint narrowing", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "trails-sqlite-bignarrow-"));
    adapter = new BetterSQLite3Adapter({ database: path.join(tmpDir, "db.sqlite3") });
    await adapter.execute(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, wide BIGINT, narrow INTEGER)",
    );
    await adapter.execute("INSERT INTO widgets (id, wide, narrow) VALUES (1, 7, 2)");
    await adapter.execute(
      "INSERT INTO widgets (id, wide, narrow) VALUES (2, 9223372036854775807, 3)",
    );
  });

  afterEach(async () => {
    await adapter.dropTable("widgets", { ifExists: true });
    await adapter.disconnectBang();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("narrows spilled bigints identically through execQuery and execute", async () => {
    const sql = "SELECT id, wide, narrow FROM widgets";
    const [viaExecQuery, wideViaExecQuery] = (await adapter.execQuery(sql)).toArray();
    const [viaExecute, wideViaExecute] = (await adapter.execute(sql))!;

    expect(typeof viaExecQuery.narrow).toBe("number");
    expect(typeof viaExecute.narrow).toBe("number");
    expect(typeof viaExecQuery.id).toBe("number");
    expect(typeof viaExecute.id).toBe("number");
    expect(typeof viaExecQuery.wide).toBe("number");
    expect(typeof viaExecute.wide).toBe("number");
    expect(wideViaExecQuery.wide).toBe(9223372036854775807n);
    expect(wideViaExecute.wide).toBe(9223372036854775807n);
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
