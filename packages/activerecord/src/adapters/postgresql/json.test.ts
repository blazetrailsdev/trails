/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/json_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { Base } from "../../index.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "json_test"`);
    await adapter.exec(
      `CREATE TABLE "json_test" ("id" SERIAL PRIMARY KEY, "settings" JSON, "prefs" JSONB, "name" VARCHAR(255))`,
    );
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "json_test"`);
    await adapter.close();
  });

  describe("PostgresqlJsonTest", () => {
    it("json column", async () => {
      const obj = { foo: "bar", baz: 123 };
      await adapter.executeMutation(`INSERT INTO "json_test" ("settings", "name") VALUES (?, ?)`, [
        JSON.stringify(obj),
        "test",
      ]);
      const rows = await adapter.execute(`SELECT "settings" FROM "json_test"`);
      expect(rows).toHaveLength(1);
      // adapter.execute returns raw strings for json/jsonb — Json#deserialize owns parsing
      expect(JSON.parse(rows[0].settings as string)).toEqual(obj);
    });

    it("json default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "json_default_test"`);
      await adapter.exec(
        `CREATE TABLE "json_default_test" ("id" SERIAL PRIMARY KEY, "config" JSON DEFAULT '{}')`,
      );
      await adapter.executeMutation(`INSERT INTO "json_default_test" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT "config" FROM "json_default_test"`);
      expect(JSON.parse(rows[0].config as string)).toEqual({});
      await adapter.exec(`DROP TABLE IF EXISTS "json_default_test"`);
    });

    it("json type cast", async () => {
      const arr = [1, "two", { three: true }];
      await adapter.executeMutation(`INSERT INTO "json_test" ("settings") VALUES (?)`, [
        JSON.stringify(arr),
      ]);
      const rows = await adapter.execute(`SELECT "settings" FROM "json_test"`);
      expect(JSON.parse(rows[0].settings as string)).toEqual(arr);
    });

    it("deserialize with array", async () => {
      const arr = [1, 2, 3];
      await adapter.executeMutation(`INSERT INTO "json_test" ("settings") VALUES (?)`, [
        JSON.stringify(arr),
      ]);
      const rows = await adapter.execute(`SELECT "settings" FROM "json_test"`);
      const parsed = JSON.parse(rows[0].settings as string);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(arr);
    });

    it("json string cast round-trip", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "json_string_cast"`);
      await adapter.exec(
        `CREATE TABLE "json_string_cast" ("id" SERIAL PRIMARY KEY, "data" JSON, "meta" JSONB)`,
      );
      try {
        class JsonStringCast extends Base {
          static {
            this.tableName = "json_string_cast";
          }
        }
        JsonStringCast.adapter = adapter;
        await JsonStringCast.loadSchema();
        const record = new JsonStringCast();
        (record as any).data = '{"a":1}';
        (record as any).meta = '{"b":2}';
        await record.save();
        await record.reload();
        expect((record as any).data).toBe('{"a":1}');
        expect((record as any).meta).toBe('{"b":2}');
      } finally {
        await adapter.exec(`DROP TABLE IF EXISTS "json_string_cast"`);
      }
    });

    it("noname columns of different types", async () => {
      const jsonVal = { key: "value" };
      const jsonbVal = { nested: { deep: true } };
      await adapter.executeMutation(
        `INSERT INTO "json_test" ("settings", "prefs", "name") VALUES (?, ?, ?)`,
        [JSON.stringify(jsonVal), JSON.stringify(jsonbVal), "test"],
      );
      const rows = await adapter.execute(`SELECT "settings", "prefs", "name" FROM "json_test"`);
      expect(JSON.parse(rows[0].settings as string)).toEqual(jsonVal);
      expect(JSON.parse(rows[0].prefs as string)).toEqual(jsonbVal);
      expect(rows[0].name).toBe("test");
    });
  });

  it("default", async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "jsonb_default_test"`);
    await adapter.exec(
      `CREATE TABLE "jsonb_default_test" ("id" SERIAL PRIMARY KEY, "data" JSONB DEFAULT '[]')`,
    );
    await adapter.executeMutation(`INSERT INTO "jsonb_default_test" DEFAULT VALUES`);
    const rows = await adapter.execute(`SELECT "data" FROM "jsonb_default_test"`);
    expect(JSON.parse(rows[0].data as string)).toEqual([]);
    await adapter.exec(`DROP TABLE IF EXISTS "jsonb_default_test"`);
  });
});
