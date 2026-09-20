import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { dumpTableSchema } from "../../support/schema-dumping-helper.js";
import type { Column as PgColumn } from "../../connection-adapters/postgresql/column.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute(`DROP TABLE IF EXISTS tsvectors`);
    await adapter.execute(`CREATE TABLE tsvectors (id serial primary key, text_vector tsvector)`);
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS tsvectors`);
    await adapter.disconnectBang();
  });

  describe("PostgresqlFullTextTest", () => {
    it("tsvector column", async () => {
      const cols = await adapter.columns("tsvectors");
      const column = cols.find((c) => c.name === "text_vector") as unknown as PgColumn;
      expect(column.type).toBe("tsvector");
      expect(column.sqlType).toBe("tsvector");
      expect(column.isArray()).toBeFalsy();

      const type = await adapter.lookupCastTypeFromColumn(column);
      expect(type.isBinary()).toBeFalsy();
    });

    it("full text search", async () => {
      await adapter.execute(`INSERT INTO tsvectors (text_vector) VALUES ('cat'::tsvector)`);
      const rows = await adapter.execute(
        `SELECT text_vector FROM tsvectors WHERE text_vector @@ to_tsquery('cat')`,
      );
      expect(rows).toHaveLength(1);
    });

    it("schema dump with shorthand", async () => {
      const output = await dumpTableSchema(adapter, "tsvectors");
      expect(output).toMatch(/t\.tsvector\("text_vector"\)/);
    });

    it("update tsvector", async () => {
      await adapter.execute(
        `INSERT INTO tsvectors (text_vector) VALUES ($$'text' 'vector'$$::tsvector)`,
      );
      const rows = await adapter.execute(`SELECT text_vector FROM tsvectors`);
      expect(String(rows[0].text_vector)).toBe("'text' 'vector'");

      await adapter.execute(
        `UPDATE tsvectors SET text_vector = $$'new' 'text' 'vector'$$::tsvector`,
      );
      const updated = await adapter.execute(`SELECT text_vector FROM tsvectors`);
      expect(updated).toBeTruthy();
      expect(String(updated[0].text_vector)).toBe("'new' 'text' 'vector'");
    });
  });
});
