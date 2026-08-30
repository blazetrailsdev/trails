import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { FloatType, DecimalType, IntegerType } from "@blazetrails/activemodel";
import { QueryAttribute } from "../relation/query-attribute.js";

describe("SQLite3Adapter integer bind serialization", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-intbind-"));
    adapter = new BetterSQLite3Adapter(path.join(tmpDir, "db.sqlite3"));
  });

  afterEach(async () => {
    await adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("binds an integer-valued number as SQLITE_INTEGER", async () => {
    const rows = (
      await adapter.execQuery("SELECT typeof(?) AS t, LOWER(?) AS l", "SQL", [1, 1])
    ).toArray();
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("1");
  });

  it("binds a non-integer number as SQLITE_FLOAT", async () => {
    const rows = (await adapter.execQuery("SELECT typeof(?) AS t", "SQL", [1.5])).toArray();
    expect(rows[0].t).toBe("real");
  });

  it("binds a boolean as SQLITE_INTEGER", async () => {
    const rows = (
      await adapter.execQuery("SELECT typeof(?) AS t, LOWER(?) AS l", "SQL", [true, true])
    ).toArray();
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("1");
  });

  it("binds a whole-valued Float attribute as SQLITE_FLOAT", async () => {
    const bind = new QueryAttribute("x", 2, new FloatType());
    const rows = (
      await adapter.execQuery("SELECT typeof(?) AS t, LOWER(?) AS l", "SQL", [bind, bind])
    ).toArray();
    expect(rows[0].t).toBe("real");
    expect(rows[0].l).toBe("2.0");
  });

  it("binds a whole-valued Decimal attribute as SQLITE_FLOAT", async () => {
    const bind = new QueryAttribute("x", 2, new DecimalType());
    const rows = (
      await adapter.execQuery("SELECT typeof(?) AS t, LOWER(?) AS l", "SQL", [bind, bind])
    ).toArray();
    expect(rows[0].t).toBe("real");
    expect(rows[0].l).toBe("2.0");
  });

  it("binds a whole-valued Integer attribute as SQLITE_INTEGER", async () => {
    const bind = new QueryAttribute("x", 2, new IntegerType());
    const rows = (
      await adapter.execQuery("SELECT typeof(?) AS t, LOWER(?) AS l", "SQL", [bind, bind])
    ).toArray();
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("2");
  });
});
