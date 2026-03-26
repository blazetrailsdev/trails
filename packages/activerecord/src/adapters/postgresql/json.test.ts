/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/json_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
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
      expect(rows[0].settings).toEqual(obj);
    });

    it("json default", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "json_default_test"`);
      await adapter.exec(
        `CREATE TABLE "json_default_test" ("id" SERIAL PRIMARY KEY, "config" JSON DEFAULT '{}')`,
      );
      await adapter.executeMutation(`INSERT INTO "json_default_test" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT "config" FROM "json_default_test"`);
      expect(rows[0].config).toEqual({});
      await adapter.exec(`DROP TABLE IF EXISTS "json_default_test"`);
    });

    it("json type cast", async () => {
      const arr = [1, "two", { three: true }];
      await adapter.executeMutation(`INSERT INTO "json_test" ("settings") VALUES (?)`, [
        JSON.stringify(arr),
      ]);
      const rows = await adapter.execute(`SELECT "settings" FROM "json_test"`);
      expect(rows[0].settings).toEqual(arr);
    });

    it("deserialize with array", async () => {
      const arr = [1, 2, 3];
      await adapter.executeMutation(`INSERT INTO "json_test" ("settings") VALUES (?)`, [
        JSON.stringify(arr),
      ]);
      const rows = await adapter.execute(`SELECT "settings" FROM "json_test"`);
      expect(Array.isArray(rows[0].settings)).toBe(true);
      expect(rows[0].settings).toEqual(arr);
    });

    it("noname columns of different types", async () => {
      const jsonVal = { key: "value" };
      const jsonbVal = { nested: { deep: true } };
      await adapter.executeMutation(
        `INSERT INTO "json_test" ("settings", "prefs", "name") VALUES (?, ?, ?)`,
        [JSON.stringify(jsonVal), JSON.stringify(jsonbVal), "test"],
      );
      const rows = await adapter.execute(`SELECT "settings", "prefs", "name" FROM "json_test"`);
      expect(rows[0].settings).toEqual(jsonVal);
      expect(rows[0].prefs).toEqual(jsonbVal);
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
    expect(rows[0].data).toEqual([]);
    await adapter.exec(`DROP TABLE IF EXISTS "jsonb_default_test"`);
  });
});
