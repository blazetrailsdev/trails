/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/quoting_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
});

afterEach(() => {
  adapter.close();
});

// -- Rails test class: quoting_test.rb --
describe("SQLite3QuotingTest", () => {
  it("quote string", async () => {
    adapter.exec(`CREATE TABLE "quote_test" ("id" INTEGER PRIMARY KEY, "val" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "quote_test" ("val") VALUES ('it''s')`);
    const rows = await adapter.execute(`SELECT "val" FROM "quote_test"`);
    expect(rows[0].val).toBe("it's");
  });

  it("quote column name", async () => {
    adapter.exec(`CREATE TABLE "q" ("weird col" TEXT)`);
    await adapter.executeMutation(`INSERT INTO "q" ("weird col") VALUES ('val')`);
    const rows = await adapter.execute(`SELECT "weird col" FROM "q"`);
    expect(rows[0]["weird col"]).toBe("val");
  });

  it("quote table name", async () => {
    adapter.exec(`CREATE TABLE "my table" ("id" INTEGER PRIMARY KEY)`);
    const rows = await adapter.execute(`SELECT * FROM "my table"`);
    expect(rows).toHaveLength(0);
  });

  it("type cast binary encoding without logger", async () => {
    adapter.exec(`CREATE TABLE "bin_enc" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    const buf = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    await adapter.executeMutation(`INSERT INTO "bin_enc" ("data") VALUES (?)`, [buf]);
    const rows = await adapter.execute(`SELECT "data" FROM "bin_enc"`);
    expect(Buffer.from(rows[0].data as Buffer)).toEqual(buf);
  });

  it("type cast true", async () => {
    adapter.exec(`CREATE TABLE "bool_test" ("id" INTEGER PRIMARY KEY, "flag" INTEGER)`);
    await adapter.executeMutation(`INSERT INTO "bool_test" ("flag") VALUES (1)`);
    const rows = await adapter.execute(`SELECT "flag" FROM "bool_test"`);
    expect(rows[0].flag).toBe(1);
  });

  it("type cast false", async () => {
    adapter.exec(`CREATE TABLE "bool_test2" ("id" INTEGER PRIMARY KEY, "flag" INTEGER)`);
    await adapter.executeMutation(`INSERT INTO "bool_test2" ("flag") VALUES (0)`);
    const rows = await adapter.execute(`SELECT "flag" FROM "bool_test2"`);
    expect(rows[0].flag).toBe(0);
  });

  it("type cast bigdecimal", async () => {
    // SQLite stores large decimals as REAL; we verify round-trip fidelity
    adapter.exec(`CREATE TABLE "bd_test" ("id" INTEGER PRIMARY KEY, "amount" REAL)`);
    await adapter.executeMutation(`INSERT INTO "bd_test" ("amount") VALUES (?)`, [123456.789]);
    const rows = await adapter.execute(`SELECT "amount" FROM "bd_test"`);
    expect(rows[0].amount).toBeCloseTo(123456.789, 3);
  });

  it("quoting binary strings", async () => {
    adapter.exec(`CREATE TABLE "bin_quote" ("id" INTEGER PRIMARY KEY, "data" BLOB)`);
    await adapter.executeMutation(`INSERT INTO "bin_quote" ("data") VALUES (X'48656C6C6F')`);
    const rows = await adapter.execute(`SELECT * FROM "bin_quote"`);
    expect(rows).toHaveLength(1);
  });

  it("quoted time returns date qualified time", async () => {
    adapter.exec(`CREATE TABLE "time_test" ("id" INTEGER PRIMARY KEY, "created_at" TEXT)`);
    const ts = "2024-01-15 10:30:00";
    await adapter.executeMutation(`INSERT INTO "time_test" ("created_at") VALUES (?)`, [ts]);
    const rows = await adapter.execute(`SELECT "created_at" FROM "time_test"`);
    expect(rows[0].created_at).toBe(ts);
  });

  it("quoted time normalizes date qualified time", async () => {
    adapter.exec(`CREATE TABLE "time_norm" ("id" INTEGER PRIMARY KEY, "ts" TEXT)`);
    const ts = "2024-06-15 08:00:00";
    await adapter.executeMutation(`INSERT INTO "time_norm" ("ts") VALUES (?)`, [ts]);
    const rows = await adapter.execute(`SELECT "ts" FROM "time_norm"`);
    expect(rows[0].ts).toBe(ts);
  });

  it("quoted time dst utc", async () => {
    adapter.exec(`CREATE TABLE "time_utc" ("id" INTEGER PRIMARY KEY, "ts" TEXT)`);
    const ts = "2024-03-10 07:00:00";
    await adapter.executeMutation(`INSERT INTO "time_utc" ("ts") VALUES (?)`, [ts]);
    const rows = await adapter.execute(`SELECT "ts" FROM "time_utc"`);
    expect(rows[0].ts).toBe(ts);
  });

  it("quoted time dst local", async () => {
    adapter.exec(`CREATE TABLE "time_local" ("id" INTEGER PRIMARY KEY, "ts" TEXT)`);
    const ts = "2024-11-03 01:30:00";
    await adapter.executeMutation(`INSERT INTO "time_local" ("ts") VALUES (?)`, [ts]);
    const rows = await adapter.execute(`SELECT "ts" FROM "time_local"`);
    expect(rows[0].ts).toBe(ts);
  });

  it("quote numeric infinity", async () => {
    adapter.exec(`CREATE TABLE "inf_test" ("id" INTEGER PRIMARY KEY, "val" REAL)`);
    // SQLite doesn't natively support Infinity — it becomes NULL
    await adapter.executeMutation(`INSERT INTO "inf_test" ("val") VALUES (?)`, [Infinity]);
    const rows = await adapter.execute(`SELECT "val" FROM "inf_test"`);
    // better-sqlite3 stores Infinity as Infinity in REAL columns
    expect(rows[0].val).toBe(Infinity);
  });

  it("quote float nan", async () => {
    adapter.exec(`CREATE TABLE "nan_test" ("id" INTEGER PRIMARY KEY, "val" REAL)`);
    // SQLite stores NaN as NULL when passed through binds
    await adapter.executeMutation(`INSERT INTO "nan_test" ("val") VALUES (?)`, [NaN]);
    const rows = await adapter.execute(`SELECT "val" FROM "nan_test"`);
    expect(rows[0].val).toBeNull();
  });
});
