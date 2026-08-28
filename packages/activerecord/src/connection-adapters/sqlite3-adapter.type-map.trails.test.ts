import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Type } from "@blazetrails/activemodel";
import type { SQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

describe("SQLite3Adapter type-map limit threading", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-typemap-"));
    adapter = new BetterSQLite3Adapter(path.join(tmpDir, "db.sqlite3"));
  });

  afterEach(async () => {
    await adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const castType = (sqlType: string) =>
    adapter.lookupCastTypeFromColumn(adapter.fetchTypeMetadata(sqlType)) as Type;

  it("keeps the full sql_type for limit-bearing families", () => {
    expect(adapter.fetchTypeMetadata("varchar(255)").sqlType).toBe("varchar(255)");
  });

  it("threads the parsed limit onto the cast type for each limit-bearing family", () => {
    for (const [sqlType, expectedType, expectedLimit] of [
      ["varchar(255)", "string", 255],
      ["char(10)", "string", 10],
      ["text(160)", "text", 160],
      ["binary(16)", "binary", 16],
      ["int(11)", "integer", 11],
      ["float(24)", "float", 24],
      ["blob(8)", "binary", 8],
      ["clob(5)", "text", 5],
    ] as const) {
      const type = castType(sqlType);
      expect(type.type()).toBe(expectedType);
      expect(type.limit).toBe(expectedLimit);
    }
  });

  it("defaults SQLite integers to an 8-byte limit when the sql_type carries none", () => {
    for (const sqlType of ["integer", "bigint"] as const) {
      const type = castType(sqlType);
      expect(type.limit).toBeUndefined();
      expect(() => type.serialize(2 ** 40)).not.toThrow();
    }
  });

  it("resolves temporal types from the paren-stripped base and threads precision", () => {
    const dt = castType("datetime(6)");
    expect(dt.type()).toBe("datetime");
    expect(dt.precision).toBe(6);
    const time = castType("time(3)");
    expect(time.type()).toBe("time");
    expect(time.precision).toBe(3);
  });

  it("keeps decimal precision and scale off the full sql_type", () => {
    const dec = castType("decimal(10,2)");
    expect(dec.type()).toBe("decimal");
    expect(dec.precision).toBe(10);
    expect(dec.scale).toBe(2);
  });

  it("reflects an unmapped sql_type as a nil cast type keeping the sql name", () => {
    const meta = adapter.fetchTypeMetadata("mystery_type");
    expect(castType("mystery_type").type()).toBeUndefined();
    expect(meta.sqlType).toBe("mystery_type");
    expect(meta.type).toBeUndefined();
  });
});
