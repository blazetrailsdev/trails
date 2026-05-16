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

    it("string column with charset and collation", async () => {
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "string_ascii_bin");
      expect(col?.type).toBe("string");
      expect(col?.collation).toBe("ascii_bin");
    });

    it("text column with charset and collation", async () => {
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

    it("change column with charset and collation", async () => {
      await adapter.addColumn("charset_collations", "description", "string", {
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
      });
      await adapter.changeColumn("charset_collations", "description", "text", {
        charset: "utf8mb4",
        collation: "utf8mb4_general_ci",
      });
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "description");
      expect(col?.type).toBe("text");
      expect(col?.collation).toBe("utf8mb4_general_ci");
    });

    it("change column doesn't preserve collation for string to binary types", async () => {
      await adapter.addColumn("charset_collations", "description", "string", {
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
      });
      await adapter.changeColumn("charset_collations", "description", "binary");
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "description");
      expect(col?.type).toBe("binary");
      expect(col?.collation).toBeNull();
    });

    it("change column doesn't preserve collation for string to non-string types", async () => {
      await adapter.addColumn("charset_collations", "description", "string", {
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
      });
      await adapter.changeColumn("charset_collations", "description", "int");
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "description");
      expect(col?.type).toBe("integer");
      expect(col?.collation).toBeNull();
    });

    it("change column preserves collation for string to text", async () => {
      await adapter.addColumn("charset_collations", "description", "string", {
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
      });
      await adapter.changeColumn("charset_collations", "description", "text");
      const columns = await adapter.columns("charset_collations");
      const col = columns.find((c) => c.name === "description");
      expect(col?.type).toBe("text");
      expect(col?.collation).toBe("utf8mb4_unicode_ci");
    });
  });
});
