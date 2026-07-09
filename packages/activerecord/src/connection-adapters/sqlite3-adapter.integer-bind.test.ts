import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import { FloatType, DecimalType, IntegerType } from "@blazetrails/activemodel";
import { QueryAttribute } from "../relation/query-attribute.js";

// The better-sqlite3 driver binds every JS number as SQLITE_FLOAT, so an
// integer-valued bind like `1` would serialize as `real` and `LOWER(?)` would
// yield `'1.0'` — diverging from MRI's sqlite3 gem, which binds a Ruby Integer
// as SQLITE_INTEGER (`LOWER(1) => '1'`). The adapter's type cast converts
// integer-valued numbers to BigInt so they bind as SQLITE_INTEGER.
describe("SQLite3Adapter integer bind serialization", () => {
  let adapter: AbstractSQLite3Adapter;
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
    const rows = await adapter.execute("SELECT typeof(?) AS t, LOWER(?) AS l", [1, 1]);
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("1");
  });

  it("binds a non-integer number as SQLITE_FLOAT", async () => {
    const rows = await adapter.execute("SELECT typeof(?) AS t", [1.5]);
    expect(rows[0].t).toBe("real");
  });

  it("binds a boolean as SQLITE_INTEGER", async () => {
    const rows = await adapter.execute("SELECT typeof(?) AS t, LOWER(?) AS l", [true, true]);
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("1");
  });

  // MRI keys the INTEGER/FLOAT choice off the Ruby object class the type-cast
  // layer produces (Integer vs Float), not the numeric value. A bind carrying a
  // Float/Decimal cast type therefore binds as SQLITE_FLOAT even when whole —
  // recovered here from the QueryAttribute's `type` since JS has no int/float split.
  it("binds a whole-valued Float attribute as SQLITE_FLOAT", async () => {
    const bind = new QueryAttribute("x", 2, new FloatType());
    const rows = await adapter.execute("SELECT typeof(?) AS t, LOWER(?) AS l", [bind, bind]);
    expect(rows[0].t).toBe("real");
    expect(rows[0].l).toBe("2.0");
  });

  it("binds a whole-valued Decimal attribute as SQLITE_FLOAT", async () => {
    const bind = new QueryAttribute("x", 2, new DecimalType());
    const rows = await adapter.execute("SELECT typeof(?) AS t, LOWER(?) AS l", [bind, bind]);
    expect(rows[0].t).toBe("real");
    expect(rows[0].l).toBe("2.0");
  });

  it("binds a whole-valued Integer attribute as SQLITE_INTEGER", async () => {
    const bind = new QueryAttribute("x", 2, new IntegerType());
    const rows = await adapter.execute("SELECT typeof(?) AS t, LOWER(?) AS l", [bind, bind]);
    expect(rows[0].t).toBe("integer");
    expect(rows[0].l).toBe("2");
  });
});
