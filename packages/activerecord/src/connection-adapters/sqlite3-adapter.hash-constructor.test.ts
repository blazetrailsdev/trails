import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { ArgumentError } from "@blazetrails/activemodel";

// Rails builds SQLite3Adapter from a single config hash whose `database` key is
// the file (or `:memory:`). trails accepts that Rails-shaped hash while keeping
// the legacy positional `(filename, options)` form as a bridge.
describe("SQLite3Adapter hash-only constructor", () => {
  let adapter: AbstractSQLite3Adapter | undefined;
  let tmpDir: string | undefined;

  afterEach(async () => {
    await adapter?.close();
    adapter = undefined;
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("opens the database named by the config hash's database key", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-hash-"));
    const file = path.join(tmpDir, "db.sqlite3");
    adapter = new BetterSQLite3Adapter({ database: file });
    // eslint-disable-next-line blazetrails/require-table-teardown -- isolated per-test tmp DB, removed in afterEach
    await adapter.executeMutation("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)");
    await adapter.executeMutation("INSERT INTO items (name) VALUES ('apple')");
    const rows = await adapter.execute("SELECT name FROM items");
    expect(rows.map((r) => r.name)).toEqual(["apple"]);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("accepts a :memory: database via the config hash", async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:" });

    await adapter.executeMutation("CREATE TABLE items (id INTEGER PRIMARY KEY)");
    const rows = await adapter.execute("SELECT count(*) AS c FROM items");
    expect(Number(rows[0].c)).toBe(0);
  });

  it("threads adapter options from the config hash", () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:", strict: true, statementLimit: 7 });
    expect(adapter.strictStrings).toBe(true);
    expect(adapter.statementLimit).toBe(7);
  });

  it("raises ArgumentError when the config hash has no database", () => {
    expect(() => new BetterSQLite3Adapter({} as { database?: string })).toThrow(ArgumentError);
    expect(() => new BetterSQLite3Adapter({} as { database?: string })).toThrow(
      "No database file specified. Missing argument: database",
    );
  });

  it("raises ArgumentError when the config hash's database is empty", () => {
    expect(() => new BetterSQLite3Adapter({ database: "" })).toThrow(ArgumentError);
  });

  it("still accepts the legacy positional (filename, options) form", () => {
    adapter = new BetterSQLite3Adapter(":memory:", { strict: true });
    expect(adapter.strictStrings).toBe(true);
  });
});
