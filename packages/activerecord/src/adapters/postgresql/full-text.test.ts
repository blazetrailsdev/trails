/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/full_text_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS tsvectors`);
    await adapter.exec(`CREATE TABLE tsvectors (id serial primary key, text_vector tsvector)`);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS tsvectors`);
    await adapter.close();
  });

  describe("PostgresqlFullTextTest", () => {
    it("tsvector column", async () => {
      const cols = await adapter.columns("tsvectors");
      const col = cols.find((c) => c.name === "text_vector")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("tsvector");
      expect(col.sqlType).toBe("tsvector");
      expect((col as any).isArray()).toBe(false);
      expect(col.type).not.toBe("binary");
    });

    it.skip("tsquery column", async () => {
      // tsquery is not a registered OID type in Rails (no corresponding Rails test).
    });

    it("full text search", async () => {
      await adapter.exec(`INSERT INTO tsvectors (text_vector) VALUES ('cat'::tsvector)`);
      const rows = await adapter.execute(
        `SELECT text_vector FROM tsvectors WHERE text_vector @@ to_tsquery('cat')`,
      );
      expect(rows).toHaveLength(1);
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "tsvectors");
      expect(output).toMatch(/t\.tsvector\("text_vector"\)/);
    });

    it("update tsvector", async () => {
      await adapter.exec(
        `INSERT INTO tsvectors (text_vector) VALUES ($$'text' 'vector'$$::tsvector)`,
      );
      const rows = await adapter.execute(`SELECT text_vector FROM tsvectors`);
      expect(String(rows[0].text_vector)).toBe("'text' 'vector'");

      await adapter.exec(`UPDATE tsvectors SET text_vector = $$'new' 'text' 'vector'$$::tsvector`);
      const updated = await adapter.execute(`SELECT text_vector FROM tsvectors`);
      expect(String(updated[0].text_vector)).toBe("'new' 'text' 'vector'");
    });
  });
});
