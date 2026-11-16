import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { Base } from "../../../../lib/base.js";
import { fixtures } from "../../../support/use-fixtures.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({}, { useTransactionalTests: false });

  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = (await Base.leaseConnection()) as PostgreSQLAdapter;
    await adapter.createTable("tsvectors", { force: true }, (t) => {
      t.tsvector("text_vector");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("tsvectors", { ifExists: true });
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
