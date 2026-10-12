import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.execute(`DROP TABLE IF EXISTS tsvectors`);
    await adapter.execute(`CREATE TABLE tsvectors (id serial primary key, text_vector tsvector)`);
  });
  afterEach(async () => {
    await adapter.execute(`DROP TABLE IF EXISTS tsvectors`);
  });

  describe("PostgresqlFullTextTest", () => {
    it("full text search", async () => {
      await adapter.execute(`INSERT INTO tsvectors (text_vector) VALUES ('cat'::tsvector)`);
      const rows = await adapter.execute(
        `SELECT text_vector FROM tsvectors WHERE text_vector @@ to_tsquery('cat')`,
      );
      expect(rows).toHaveLength(1);
    });
  });
});
