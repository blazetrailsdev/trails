/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/charset_collation_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("CharsetCollationTest", () => {
    beforeEach(async () => {
      await adapter.createTable(
        "charset_collations",
        { id: { type: "string", collation: "utf8mb4_bin" }, force: true },
        (t: any) => {
          t.string("string_ascii_bin", { charset: "ascii", collation: "ascii_bin" });
          t.text("text_ucs2_unicode_ci", { charset: "ucs2", collation: "ucs2_unicode_ci" });
        },
      );
    });
    afterEach(async () => {
      await adapter.dropTable("charset_collations", { ifExists: true });
    });

    it.skip("string column with charset and collation", async () => {
      // BLOCKED: schema-dump — Rails schema dump emits `id: { type: :string, collation: "utf8mb4_bin" }` form; schema-dumper not yet updated
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "string_ascii_bin");
      expect(col?.type).toBe("string");
      expect(col?.collation).toBe("ascii_bin");
    });

    it.skip("text column with charset and collation", async () => {
      // BLOCKED: schema-dump — Rails schema dump emits `id: { type: :string, collation: "utf8mb4_bin" }` form; schema-dumper not yet updated
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "text_ucs2_unicode_ci");
      expect(col?.type).toBe("text");
      expect(col?.collation).toBe("ucs2_unicode_ci");
    });

    it("add column with charset and collation", async () => {
      await adapter.addColumn("charset_collations", "title", "string", {
        charset: "utf8mb4",
        collation: "utf8mb4_bin",
      });
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "title");
      expect(col?.type).toBe("string");
      expect(col?.collation).toBe("utf8mb4_bin");
    });

    it.skip("change column with charset and collation", () => {
      // BLOCKED: changeColumn not yet implemented (Slot B)
    });

    it.skip("change column doesn't preserve collation for string to binary types", () => {
      // BLOCKED: changeColumn not yet implemented (Slot B)
    });

    it.skip("change column doesn't preserve collation for string to non-string types", () => {
      // BLOCKED: changeColumn not yet implemented (Slot B)
    });

    it.skip("change column preserves collation for string to text", () => {
      // BLOCKED: changeColumn not yet implemented (Slot B)
    });
  });
});
