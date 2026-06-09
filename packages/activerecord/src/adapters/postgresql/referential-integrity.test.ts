/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/referential_integrity_test.rb
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { InvalidForeignKey, StatementInvalid } from "../../errors.js";

// Mirrors the Ruby IS_REFERENTIAL_INTEGRITY_SQL lambda — matches the joined
// "ALTER TABLE … DISABLE/ENABLE TRIGGER ALL" string disable_referential_integrity runs.
const isReferentialIntegritySql = (sql: unknown): boolean =>
  typeof sql === "string" && (/DISABLE TRIGGER ALL/.test(sql) || /ENABLE TRIGGER ALL/.test(sql));

// Mirrors `module MissingSuperuserPrivileges`: when the DISABLE/ENABLE TRIGGER
// statement runs, poison the transaction with a broken statement (rescued) then
// raise — simulating a connection lacking superuser privileges.
function extendMissingSuperuserPrivileges(adapter: PostgreSQLAdapter): void {
  const original = adapter.execute.bind(adapter);
  (adapter as { execute: PostgreSQLAdapter["execute"] }).execute = async (sql, ...rest) => {
    if (isReferentialIntegritySql(sql)) {
      await original("BROKEN;").catch(() => {});
      throw new StatementInvalid("PG::InsufficientPrivilege", { sql: String(sql), binds: [] });
    }
    return original(sql, ...rest);
  };
}

// Mirrors `module ProgrammerMistake`: a non-ActiveRecord error raised while
// toggling referential integrity must bubble straight up.
function extendProgrammerMistake(adapter: PostgreSQLAdapter): void {
  const original = adapter.execute.bind(adapter);
  (adapter as { execute: PostgreSQLAdapter["execute"] }).execute = async (sql, ...rest) => {
    if (isReferentialIntegritySql(sql)) {
      throw new Error("something is not right.");
    }
    return original(sql, ...rest);
  };
}

// disable_referential_integrity maps over `tables()`; a dummy table guarantees
// the generated SQL is non-empty so the patched execute fires.
async function withDummyTable(adapter: PostgreSQLAdapter, fn: () => Promise<void>): Promise<void> {
  await adapter.execute(`CREATE TABLE IF NOT EXISTS "referential_integrity_dummy" ("id" SERIAL)`);
  try {
    await fn();
  } finally {
    await adapter.execute(`DROP TABLE IF EXISTS "referential_integrity_dummy" CASCADE`);
  }
}

// Mirrors `assert_transaction_is_not_broken`: a live transaction can still query.
async function assertTransactionIsNotBroken(adapter: PostgreSQLAdapter): Promise<void> {
  const rows = await adapter.execute("SELECT 1 AS n");
  expect(rows[0].n).toBe(1);
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlReferentialIntegrityTest", () => {
    it("should reraise invalid foreign key exception and show warning", async () => {
      extendMissingSuperuserPrivileges(adapter);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await withDummyTable(adapter, async () => {
          await expect(
            adapter.disableReferentialIntegrity(async () => {
              throw new InvalidForeignKey("Should be re-raised", { sql: "", binds: [] });
            }),
          ).rejects.toThrow("Should be re-raised");
        });
        const warning = warnSpy.mock.calls.map((c) => String(c[0])).join("\n");
        expect(warning).toMatch(/WARNING: Rails was not able to disable referential integrity/);
        expect(warning).toMatch(/cause: PG::InsufficientPrivilege/);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("does not print warning if no invalid foreign key exception was raised", async () => {
      extendMissingSuperuserPrivileges(adapter);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        await withDummyTable(adapter, async () => {
          await expect(
            adapter.disableReferentialIntegrity(async () => {
              throw new StatementInvalid("Should be re-raised", { sql: "", binds: [] });
            }),
          ).rejects.toThrow("Should be re-raised");
        });
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("does not break transactions", async () => {
      extendMissingSuperuserPrivileges(adapter);
      await withDummyTable(adapter, async () => {
        await adapter.transaction(async () => {
          await adapter.disableReferentialIntegrity(async () => {
            await assertTransactionIsNotBroken(adapter);
          });
          await assertTransactionIsNotBroken(adapter);
        });
      });
    });

    it("does not break nested transactions", async () => {
      extendMissingSuperuserPrivileges(adapter);
      await withDummyTable(adapter, async () => {
        await adapter.transaction(async () => {
          await adapter.transaction(
            async () => {
              await adapter.disableReferentialIntegrity(async () => {
                await assertTransactionIsNotBroken(adapter);
              });
            },
            { requiresNew: true },
          );
          await assertTransactionIsNotBroken(adapter);
        });
      });
    });

    it("only catch active record errors others bubble up", async () => {
      extendProgrammerMistake(adapter);
      await withDummyTable(adapter, async () => {
        await expect(adapter.disableReferentialIntegrity(async () => {})).rejects.toThrow(
          "something is not right.",
        );
      });
    });

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
