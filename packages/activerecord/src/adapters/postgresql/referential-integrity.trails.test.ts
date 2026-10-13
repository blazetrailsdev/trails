import { it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresqlReferentialIntegrityTest (trails)", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    try {
      await adapter.execute(
        `DROP TABLE IF EXISTS referential_integrity_violation_test.parents, referential_integrity_violation_test.children, referential_integrity_tx_test.nodes CASCADE`,
      );
    } catch {}
    await adapter.disconnectBang();
  });

  it("check all foreign keys valid raises on violated constraint", async () => {
    await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_violation_test CASCADE`);
    await adapter.execute(`CREATE SCHEMA referential_integrity_violation_test`);
    try {
      await adapter.execute(`
        CREATE TABLE referential_integrity_violation_test.parents (id BIGSERIAL PRIMARY KEY)
      `);
      await adapter.execute(`
        CREATE TABLE referential_integrity_violation_test.children (
          id        BIGSERIAL PRIMARY KEY,
          parent_id BIGINT NOT NULL
        )
      `);

      await adapter.execute(
        `INSERT INTO referential_integrity_violation_test.children (parent_id) VALUES (9999)`,
      );
      await adapter.execute(`
        ALTER TABLE referential_integrity_violation_test.children
          ADD CONSTRAINT fk_children_parent
          FOREIGN KEY (parent_id)
          REFERENCES referential_integrity_violation_test.parents (id)
          NOT VALID
      `);

      await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow();

      await adapter.beginTransaction({ _lazy: false });
      try {
        await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow();
        const result = await adapter.execute("SELECT 1 AS n");
        expect(result[0].n).toBe(1);
      } finally {
        await adapter.commitTransaction();
      }
    } finally {
      await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_violation_test CASCADE`);
    }
  });

  it("check all foreign keys valid inside a transaction uses savepoint", async () => {
    await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_tx_test CASCADE`);
    await adapter.execute(`CREATE SCHEMA referential_integrity_tx_test`);
    try {
      await adapter.execute(
        `CREATE TABLE referential_integrity_tx_test.nodes (id BIGSERIAL PRIMARY KEY)`,
      );

      await adapter.beginTransaction({ _lazy: false });
      try {
        await adapter.checkAllForeignKeysValidBang();

        const result = await adapter.execute("SELECT 1 AS n");
        expect(result[0].n).toBe(1);
      } finally {
        await adapter.commitTransaction();
      }
    } finally {
      await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_tx_test CASCADE`);
    }
  });
});
