/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_authorization_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

const TABLE_NAME = "schema_things";
const COLUMNS = "id serial primary key, name character varying(50)";
const USERS = ["rails_pg_schema_user1", "rails_pg_schema_user2"];

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  describe("SchemaAuthorizationTest", () => {
    beforeEach(async () => {
      adapter = new PostgreSQLAdapter(PG_TEST_URL);
      await adapter.execute(`SET search_path TO '$user',public`);
      await adapter.sessionAuth("default");
      for (const u of USERS) {
        try {
          await adapter.execute(`CREATE USER ${u}`);
        } catch {}
        try {
          await adapter.execute(`CREATE SCHEMA AUTHORIZATION ${u}`);
        } catch {}
        await adapter.sessionAuth(u);
        await adapter.execute(`CREATE TABLE ${TABLE_NAME} (${COLUMNS})`);
        await adapter.execute(`INSERT INTO ${TABLE_NAME} (name) VALUES ('${u}')`);
        await adapter.sessionAuth("default");
      }
    });

    afterEach(async () => {
      await adapter.sessionAuth("default");
      await adapter.execute(`RESET search_path`);
      for (const u of USERS) {
        await adapter.dropSchema(u, { ifExists: true });
        try {
          await adapter.execute(`DROP USER IF EXISTS ${u}`);
        } catch {}
      }
      await adapter.close();
    });

    it("schema invisible", async () => {
      await adapter.sessionAuth("default");
      await expect(adapter.execute(`SELECT * FROM ${TABLE_NAME}`)).rejects.toThrow();
    });

    it("session auth=", async () => {
      await adapter.sessionAuth("DEFAULT");
      await expect(adapter.execute(`SELECT * FROM ${TABLE_NAME}`)).rejects.toThrow();
    });

    it("setting auth clears stmt cache", async () => {
      await adapter.sessionAuth("default");
      for (const u of USERS) {
        await adapter.sessionAuth(u);
        const value = await adapter.selectValue(`SELECT name FROM ${TABLE_NAME} WHERE id = 1`);
        expect(value).toBe(u);
        await adapter.sessionAuth("default");
      }
    });

    it("auth with bind", async () => {
      await adapter.sessionAuth("default");
      for (const u of USERS) {
        await adapter.clearCacheBang();
        await adapter.sessionAuth(u);
        const result = await adapter.execute(`SELECT name FROM ${TABLE_NAME} WHERE id = $1`, [1]);
        expect(result[0]?.name).toBe(u);
        await adapter.sessionAuth("default");
      }
    });

    it.skip("sequence schema caching", () => {
      // BLOCKED: needs-ar-model — SchemaThing AR model (schema_things table) requires full AR model layer
      // ROOT-CAUSE: test exercises SchemaThing.new/save! through the model layer; no AR model infrastructure in adapter tests
      // SCOPE: needs AR model setup similar to packages/activerecord/src/adapters/postgresql/active-schema.test.ts pattern
    });

    it("tables in current schemas", async () => {
      expect(await adapter.tables()).not.toContain(TABLE_NAME);
      for (const u of USERS) {
        await adapter.sessionAuth(u);
        expect(await adapter.tables()).toContain(TABLE_NAME);
        await adapter.sessionAuth("default");
      }
    });
  });
});
