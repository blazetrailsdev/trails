/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/referential_integrity_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlReferentialIntegrityTest", () => {
    it.skip("enable referential integrity", async () => {});
    it.skip("disable and enable referential integrity", async () => {});
    it.skip("foreign key violation without disable", async () => {});
    it.skip("foreign key violation with disable", async () => {});
    it.skip("truncate with cascade", async () => {});
    it.skip("should reraise invalid foreign key exception and show warning", () => {});
    it.skip("does not print warning if no invalid foreign key exception was raised", () => {});
    it.skip("does not break transactions", () => {});
    it.skip("does not break nested transactions", () => {});
    it.skip("only catch active record errors others bubble up", () => {});

    // Mirrors: test_all_foreign_keys_valid_having_foreign_keys_in_multiple_schemas
    it("all foreign keys valid having foreign keys in multiple schemas", async () => {
      await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_test_schema CASCADE`);
      await adapter.execute(`CREATE SCHEMA referential_integrity_test_schema`);
      try {
        await adapter.execute(`
          CREATE TABLE referential_integrity_test_schema.nodes (
            id        BIGSERIAL,
            parent_id BIGINT NOT NULL,
            PRIMARY KEY (id),
            CONSTRAINT fk_parent_node FOREIGN KEY (parent_id)
              REFERENCES referential_integrity_test_schema.nodes (id)
          )
        `);

        const rows = await adapter.execute(`
          SELECT count(*) AS count
            FROM information_schema.table_constraints
           WHERE constraint_schema = 'referential_integrity_test_schema'
             AND constraint_type = 'FOREIGN KEY'
        `);
        expect(Number(rows[0].count)).toBe(1);

        // Should not throw when all FK constraints are valid
        await expect(adapter.checkAllForeignKeysValidBang()).resolves.toBeUndefined();
      } finally {
        await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_test_schema CASCADE`);
      }
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

        // Insert a child row that references a non-existent parent.
        await adapter.execute(
          `INSERT INTO referential_integrity_violation_test.children (parent_id) VALUES (9999)`,
        );
        // Add the FK constraint NOT VALID so it can be created despite the bad row.
        await adapter.execute(`
          ALTER TABLE referential_integrity_violation_test.children
            ADD CONSTRAINT fk_children_parent
            FOREIGN KEY (parent_id)
            REFERENCES referential_integrity_violation_test.parents (id)
            NOT VALID
        `);

        // checkAllForeignKeysValidBang re-validates every FK — should raise.
        await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow();

        // When called inside a transaction the savepoint is rolled back on
        // failure, leaving the outer transaction still usable.
        await adapter.beginTransaction();
        try {
          await expect(adapter.checkAllForeignKeysValidBang()).rejects.toThrow();
          const result = await adapter.execute("SELECT 1 AS n");
          expect(result[0].n).toBe(1);
        } finally {
          await adapter.commit();
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

        await adapter.beginTransaction();
        try {
          // Inside a transaction the method uses a SAVEPOINT, so the
          // surrounding transaction stays usable after the check.
          await expect(adapter.checkAllForeignKeysValidBang()).resolves.toBeUndefined();

          // Transaction should still be live — a query should succeed.
          const result = await adapter.execute("SELECT 1 AS n");
          expect(result[0].n).toBe(1);
        } finally {
          await adapter.commit();
        }
      } finally {
        await adapter.execute(`DROP SCHEMA IF EXISTS referential_integrity_tx_test CASCADE`);
      }
    });
  });
});
