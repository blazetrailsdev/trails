import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { InvalidForeignKey, StatementInvalid } from "../../errors.js";

const isReferentialIntegritySql = (sql: unknown): boolean =>
  typeof sql === "string" && (/DISABLE TRIGGER ALL/.test(sql) || /ENABLE TRIGGER ALL/.test(sql));

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

function extendProgrammerMistake(adapter: PostgreSQLAdapter): void {
  const original = adapter.execute.bind(adapter);
  (adapter as { execute: PostgreSQLAdapter["execute"] }).execute = async (sql, ...rest) => {
    if (isReferentialIntegritySql(sql)) {
      throw new Error("something is not right.");
    }
    return original(sql, ...rest);
  };
}

async function withDummyTable(adapter: PostgreSQLAdapter, fn: () => Promise<void>): Promise<void> {
  await adapter.execute(`CREATE TABLE IF NOT EXISTS "referential_integrity_dummy" ("id" SERIAL)`);
  try {
    await fn();
  } finally {
    await adapter.execute(`DROP TABLE IF EXISTS "referential_integrity_dummy" CASCADE`);
  }
}

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
    try {
      await adapter.execute(
        `DROP TABLE IF EXISTS referential_integrity_test_schema.nodes, referential_integrity_violation_test.parents, referential_integrity_violation_test.children, referential_integrity_tx_test.nodes CASCADE`,
      );
    } catch {}
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
          await expect(adapter.checkAllForeignKeysValidBang()).resolves.toBeUndefined();

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
});
