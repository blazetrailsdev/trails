/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/utils_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";
import { PgName, extractSchemaQualifiedName } from "./utils.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS utils_reset_pk CASCADE");
    await adapter.exec("DROP TABLE IF EXISTS utils_reset_pk_custom CASCADE");
    await adapter.close();
  });

  describe("PostgreSQLNameTest", () => {
    it("reset pk sequence on empty table", async () => {
      await adapter.exec(
        `CREATE TABLE utils_reset_pk (id serial primary key, name text)`,
      );
      await adapter.exec(`SELECT setval('utils_reset_pk_id_seq', 123)`);
      await adapter.resetPkSequence("utils_reset_pk");
      const rows = await adapter.execute(
        `SELECT nextval('utils_reset_pk_id_seq') AS val`,
      );
      expect(Number(rows[0].val)).toBe(1);
    });

    it("reset pk sequence with custom pk", async () => {
      await adapter.exec(
        `CREATE TABLE utils_reset_pk_custom (custom_id serial primary key, name text)`,
      );
      await adapter.executeMutation(
        `INSERT INTO utils_reset_pk_custom (name) VALUES ('a')`,
      );
      await adapter.executeMutation(
        `INSERT INTO utils_reset_pk_custom (name) VALUES ('b')`,
      );
      await adapter.exec(`SELECT setval('utils_reset_pk_custom_custom_id_seq', 100)`);
      await adapter.resetPkSequence("utils_reset_pk_custom");
      const rows = await adapter.execute(
        `SELECT nextval('utils_reset_pk_custom_custom_id_seq') AS val`,
      );
      expect(Number(rows[0].val)).toBe(3);
    });

    it.skip("distinct zero", async () => {});
    it.skip("distinct one", async () => {});
    it.skip("distinct multiple", async () => {});

    it("extract schema qualified name", () => {
      const cases: Record<string, [string | null, string]> = {
        table_name: [null, "table_name"],
        '"table.name"': [null, "table.name"],
        "schema.table_name": ["schema", "table_name"],
        '"schema".table_name': ["schema", "table_name"],
        'schema."table_name"': ["schema", "table_name"],
        '"schema"."table_name"': ["schema", "table_name"],
        '"even spaces".table': ["even spaces", "table"],
        'schema."table.name"': ["schema", "table.name"],
      };
      for (const [given, [expectedSchema, expectedName]] of Object.entries(cases)) {
        const result = extractSchemaQualifiedName(given);
        expect(result.schema).toBe(expectedSchema);
        expect(result.identifier).toBe(expectedName);
      }
    });

    it("represents itself as schema.name", () => {
      const obj = new PgName("public", "articles");
      expect(obj.toString()).toBe("public.articles");
    });

    it("without schema, represents itself as name only", () => {
      const obj = new PgName(null, "articles");
      expect(obj.toString()).toBe("articles");
    });

    it("quoted returns a string representation usable in a query", () => {
      expect(new PgName(null, "articles").quoted()).toBe('"articles"');
      expect(new PgName("public", "articles").quoted()).toBe(
        '"public"."articles"',
      );
    });

    it("prevents double quoting", () => {
      const name = new PgName('"quoted_schema"', '"quoted_table"');
      expect(name.toString()).toBe("quoted_schema.quoted_table");
      expect(name.quoted()).toBe('"quoted_schema"."quoted_table"');
    });

    it("equality based on state", () => {
      expect(
        new PgName("access", "users").equals(new PgName("access", "users")),
      ).toBe(true);
      expect(
        new PgName(null, "users").equals(new PgName(null, "users")),
      ).toBe(true);
      expect(
        new PgName(null, "users").equals(new PgName("access", "users")),
      ).toBe(false);
      expect(
        new PgName("access", "users").equals(new PgName("public", "users")),
      ).toBe(false);
      expect(
        new PgName("public", "users").equals(new PgName("public", "articles")),
      ).toBe(false);
    });

    it("can be used as hash key", () => {
      const map = new Map<string, string>();
      map.set(new PgName("schema", "article_seq").hashKey(), "success");
      expect(map.get(new PgName("schema", "article_seq").hashKey())).toBe(
        "success",
      );
      expect(
        map.get(new PgName("schema", "articles").hashKey()),
      ).toBeUndefined();
      expect(
        map.get(new PgName("public", "article_seq").hashKey()),
      ).toBeUndefined();
    });
  });
});
