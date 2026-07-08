import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";

// trails-only coverage for the SQLite `register_class_with_limit` convergence
// (RFC 0043 converge-sqlite-limit-to-register-class-with-limit). Rails threads a
// column's limit at type-map lookup time — the `char`/`binary`/`text`/`int`/
// `float` factories parse the matched `sql_type` string via `extract_limit`
// (abstract_adapter.rb:919). These assert the full reflection path
// (`fetchTypeMetadata` → `lookupCastTypeFromColumn`) carries the limit without
// the reflective cast-type rebuild that previously stood in for it.
describe("SQLite3Adapter type-map limit threading", () => {
  let adapter: AbstractSQLite3Adapter;
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
    adapter.lookupCastTypeFromColumn(adapter.fetchTypeMetadata(sqlType));

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
      // blob/clob alias to binary/text and must thread the limit through them.
      ["blob(8)", "binary", 8],
      ["clob(5)", "text", 5],
    ] as const) {
      const type = castType(sqlType);
      expect(type.type()).toBe(expectedType);
      expect(type.limit).toBe(expectedLimit);
    }
  });

  it("defaults SQLite integers to an 8-byte limit when the sql_type carries none", () => {
    // Rails' SQLite3Integer overrides only the private `_limit` (→ 8), leaving
    // the public `limit` reader nil so `fetch_type_metadata` reflects a bare
    // `limit` and dumps stay bare. The 8-byte default still governs range: a
    // value beyond a 4-byte int's max (2^31) but within 8 bytes is accepted.
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
});
