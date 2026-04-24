import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigIntegerType, IntegerType, BooleanType } from "@blazetrails/activemodel";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

let adapter: SQLite3Adapter;
const bigType = new BigIntegerType();
const intType = new IntegerType();
const boolType = new BooleanType();

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
  adapter.exec(`
    CREATE TABLE "big_items" (
      "id"     INTEGER PRIMARY KEY AUTOINCREMENT,
      "score"  BIGINT NOT NULL,
      "count"  INTEGER NOT NULL DEFAULT 0,
      "active" INTEGER NOT NULL DEFAULT 1
    )
  `);
});

afterEach(() => {
  adapter.close();
});

describe("SQLite3 bigint round-trip", () => {
  const BIG = 2n ** 62n; // 4611686018427387904 — well above Number.MAX_SAFE_INTEGER

  it("returns bigint for BIGINT column", async () => {
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "count") VALUES (?, ?)`, [
      BIG,
      1,
    ]);
    const rows = await adapter.execute(`SELECT "score", "count" FROM "big_items"`);
    expect(typeof rows[0].score).toBe("bigint");
    expect(rows[0].score).toBe(BIG);
  });

  it("preserves exact value above Number.MAX_SAFE_INTEGER", async () => {
    const unsafe = 9007199254740993n; // Number.MAX_SAFE_INTEGER + 2
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "count") VALUES (?, ?)`, [
      unsafe,
      0,
    ]);
    const rows = await adapter.execute(`SELECT "score" FROM "big_items"`);
    expect(bigType.cast(rows[0].score)).toBe(unsafe);
  });

  it("IntegerType.cast coerces safeIntegers bigint back to number for INTEGER columns", async () => {
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "count") VALUES (?, ?)`, [
      BIG,
      42,
    ]);
    const rows = await adapter.execute(`SELECT "score", "count" FROM "big_items"`);
    // safeIntegers is enabled on this statement (BIGINT column present),
    // so INTEGER column also comes back as bigint from the driver.
    // IntegerType.cast converts it back to number — this is the type-layer contract.
    expect(intType.cast(rows[0].count)).toBe(42);
  });

  it("BooleanType.cast handles 0n/1n from safeIntegers mode correctly", async () => {
    // SQLite stores booleans as INTEGER 0/1. With safeIntegers enabled (triggered
    // by the BIGINT column), the driver returns 0n/1n instead of 0/1.
    // BooleanType.FALSE_VALUES includes 0n so cast(0n) → false, cast(1n) → true.
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "active") VALUES (?, ?)`, [
      BIG,
      0,
    ]);
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "active") VALUES (?, ?)`, [
      BIG,
      1,
    ]);
    const rows = await adapter.execute(`SELECT "active" FROM "big_items" ORDER BY "id"`);
    expect(boolType.cast(rows[0].active)).toBe(false);
    expect(boolType.cast(rows[1].active)).toBe(true);
  });

  it("update round-trip preserves value", async () => {
    await adapter.executeMutation(`INSERT INTO "big_items" ("score", "count") VALUES (?, ?)`, [
      BIG,
      0,
    ]);
    await adapter.executeMutation(`UPDATE "big_items" SET "score" = ?`, [BIG + 1n]);
    const rows = await adapter.execute(`SELECT "score" FROM "big_items"`);
    expect(bigType.cast(rows[0].score)).toBe(BIG + 1n);
  });
});
