import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS utils_reset_pk CASCADE");
    await adapter.execute("DROP TABLE IF EXISTS utils_reset_pk_custom CASCADE");
    await adapter.disconnectBang();
  });

  describe("PostgreSQLUtilsTest", () => {
    it("reset pk sequence on empty table", async () => {
      await adapter.execute(`CREATE TABLE utils_reset_pk (id serial primary key, name text)`);
      await adapter.execute(`SELECT setval('utils_reset_pk_id_seq', 123)`);
      await adapter.resetPkSequenceBang("utils_reset_pk");
      const rows = await adapter.execute(`SELECT nextval('utils_reset_pk_id_seq') AS val`);
      expect(Number(rows[0].val)).toBe(1);
    });

    it("reset pk sequence with custom pk", async () => {
      await adapter.execute(
        `CREATE TABLE utils_reset_pk_custom (custom_id serial primary key, name text)`,
      );
      await adapter.execute(`INSERT INTO utils_reset_pk_custom (name) VALUES ('a')`);
      await adapter.execute(`INSERT INTO utils_reset_pk_custom (name) VALUES ('b')`);
      await adapter.execute(`SELECT setval('utils_reset_pk_custom_custom_id_seq', 100)`);
      await adapter.resetPkSequenceBang("utils_reset_pk_custom");
      const rows = await adapter.execute(
        `SELECT nextval('utils_reset_pk_custom_custom_id_seq') AS val`,
      );
      expect(Number(rows[0].val)).toBe(3);
    });
  });
});
