import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { Name, Utils } from "../../connection-adapters/postgresql/utils.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  describe("PostgreSQLUtilsTest", () => {
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
        const result = Utils.extractSchemaQualifiedName(given);
        expect(result).toEqual(new Name(expectedSchema, expectedName));
      }
    });
  });

  describe("PostgreSQLNameTest", () => {
    it("represents itself as schema.name", () => {
      const obj = new Name("public", "articles");
      expect(obj.toString()).toBe("public.articles");
    });

    it("without schema, represents itself as name only", () => {
      const obj = new Name(null, "articles");
      expect(obj.toString()).toBe("articles");
    });

    it("quoted returns a string representation usable in a query", () => {
      expect(new Name(null, "articles").quoted()).toBe('"articles"');
      expect(new Name("public", "articles").quoted()).toBe('"public"."articles"');
    });

    it("prevents double quoting", () => {
      const name = new Name('"quoted_schema"', '"quoted_table"');
      expect(name.toString()).toBe("quoted_schema.quoted_table");
      expect(name.quoted()).toBe('"quoted_schema"."quoted_table"');
    });

    it("equality based on state", () => {
      expect(new Name("access", "users")).toEqual(new Name("access", "users"));
      expect(new Name(null, "users")).toEqual(new Name(null, "users"));
      expect(new Name(null, "users")).not.toEqual(new Name("access", "users"));
      expect(new Name("access", "users")).not.toEqual(new Name("public", "users"));
      expect(new Name("public", "users")).not.toEqual(new Name("public", "articles"));
    });

    it("can be used as hash key", () => {
      const map = new Map<number, string>();
      map.set(new Name("schema", "article_seq").hash(), "success");
      expect(map.get(new Name("schema", "article_seq").hash())).toBe("success");
      expect(map.get(new Name("schema", "articles").hash())).toBeUndefined();
      expect(map.get(new Name("public", "article_seq").hash())).toBeUndefined();
    });
  });
});
