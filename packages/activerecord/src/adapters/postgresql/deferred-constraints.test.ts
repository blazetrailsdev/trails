/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/deferred_constraints_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { InvalidForeignKey } from "../../errors.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlDeferredConstraintsTest", () => {
    it("deferrable initially deferred", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_defd_c`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_defd_p`);
      await adapter.execute(`CREATE TABLE dc_defd_p (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_defd_c (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      try {
        await adapter.addForeignKey("dc_defd_c", "dc_defd_p", {
          column: "par_id",
          name: "dc_fk_defd",
          deferrable: "deferred",
        });
        const fks = await adapter.foreignKeys("dc_defd_c");
        expect(fks.length).toBe(1);
        expect(fks[0].deferrable).toBe("deferred");
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_defd_c`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_defd_p`);
      }
    });

    it("deferrable initially immediate", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_imm_c`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_imm_p`);
      await adapter.execute(`CREATE TABLE dc_imm_p (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_imm_c (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      try {
        await adapter.addForeignKey("dc_imm_c", "dc_imm_p", {
          column: "par_id",
          name: "dc_fk_imm",
          deferrable: "immediate",
        });
        const fks = await adapter.foreignKeys("dc_imm_c");
        expect(fks.length).toBe(1);
        expect(fks[0].deferrable).toBe("immediate");
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_imm_c`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_imm_p`);
      }
    });

    it("not deferrable", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_nd_c`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_nd_p`);
      await adapter.execute(`CREATE TABLE dc_nd_p (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_nd_c (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      try {
        await adapter.addForeignKey("dc_nd_c", "dc_nd_p", {
          column: "par_id",
          name: "dc_fk_nd",
        });
        const fks = await adapter.foreignKeys("dc_nd_c");
        expect(fks.length).toBe(1);
        expect(fks[0].deferrable).toBeFalsy();
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_nd_c`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_nd_p`);
      }
    });

    it("set constraints all deferred", async () => {
      await adapter.beginTransaction();
      try {
        await adapter.setConstraints("deferred");
        await adapter.commit();
      } catch (e) {
        await adapter.rollback().catch(() => {});
        throw e;
      }
    });

    it("set constraints all immediate", async () => {
      await adapter.beginTransaction();
      try {
        await adapter.setConstraints("immediate");
        await adapter.commit();
      } catch (e) {
        await adapter.rollback().catch(() => {});
        throw e;
      }
    });

    it("defer constraints", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_par`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_ch`);
      await adapter.execute(`CREATE TABLE dc_par (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_ch (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      await adapter.addForeignKey("dc_ch", "dc_par", {
        column: "par_id",
        name: "dc_ch_fk",
        deferrable: "immediate",
      });
      try {
        await adapter.beginTransaction();
        try {
          await adapter.setConstraints("deferred");
          // INSERT must succeed — FK is deferred (mirrors Rails assert_nothing_raised).
          // If it throws the error propagates through finally and the test fails correctly.
          await adapter.execute(`INSERT INTO dc_ch (par_id) VALUES (-1)`);
          // set_constraints(:immediate) triggers the deferred FK check → raises.
          await expect(adapter.setConstraints("immediate")).rejects.toThrow(InvalidForeignKey);
        } finally {
          await adapter.rollback().catch(() => {});
        }
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_ch`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_par`);
      }
    });

    it("defer constraints with specific fk", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_par`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_ch`);
      await adapter.execute(`CREATE TABLE dc_par (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_ch (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      await adapter.addForeignKey("dc_ch", "dc_par", {
        column: "par_id",
        name: "dc_ch_fk",
        deferrable: "immediate",
      });
      try {
        const fkName = (await adapter.foreignKeys("dc_ch"))[0].name;
        await adapter.beginTransaction();
        try {
          await adapter.setConstraints("deferred", fkName);
          // INSERT must succeed (mirrors Rails assert_nothing_raised).
          await adapter.execute(`INSERT INTO dc_ch (par_id) VALUES (-1)`);
          // set_constraints(:immediate, @fk) triggers FK check → raises.
          await expect(adapter.setConstraints("immediate", fkName)).rejects.toThrow(
            InvalidForeignKey,
          );
        } finally {
          await adapter.rollback().catch(() => {});
        }
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_ch`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_par`);
      }
    });

    it("defer constraints with multiple fks", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_m_ch`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_m_p1`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_m_p2`);
      await adapter.execute(`CREATE TABLE dc_m_p1 (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_m_p2 (id SERIAL PRIMARY KEY)`);
      await adapter.execute(
        `CREATE TABLE dc_m_ch (id SERIAL PRIMARY KEY, p1_id INT NOT NULL, p2_id INT NOT NULL)`,
      );
      await adapter.addForeignKey("dc_m_ch", "dc_m_p1", {
        column: "p1_id",
        name: "dc_m_fk1",
        deferrable: "immediate",
      });
      await adapter.addForeignKey("dc_m_ch", "dc_m_p2", {
        column: "p2_id",
        name: "dc_m_fk2",
        deferrable: "immediate",
      });
      try {
        await adapter.beginTransaction();
        try {
          await adapter.setConstraints("deferred", "dc_m_fk1", "dc_m_fk2");
          // INSERT must succeed (mirrors Rails assert_nothing_raised).
          await adapter.execute(`INSERT INTO dc_m_ch (p1_id, p2_id) VALUES (-1, -1)`);
          // set_constraints(:immediate, ...) triggers FK checks → raises.
          await expect(adapter.setConstraints("immediate", "dc_m_fk1", "dc_m_fk2")).rejects.toThrow(
            InvalidForeignKey,
          );
        } finally {
          await adapter.rollback().catch(() => {});
        }
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_m_ch`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_m_p1`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_m_p2`);
      }
    });

    it("defer constraints only defers single fk", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_s_ch`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_s_p1`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_s_p2`);
      await adapter.execute(`CREATE TABLE dc_s_p1 (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_s_p2 (id SERIAL PRIMARY KEY)`);
      await adapter.execute(
        `CREATE TABLE dc_s_ch (id SERIAL PRIMARY KEY, p1_id INT NOT NULL, p2_id INT NOT NULL)`,
      );
      // FK1 is NOT deferrable — always immediate regardless of SET CONSTRAINTS.
      await adapter.addForeignKey("dc_s_ch", "dc_s_p1", {
        column: "p1_id",
        name: "dc_s_fk1",
      });
      // FK2 is deferrable — can be set to deferred.
      await adapter.addForeignKey("dc_s_ch", "dc_s_p2", {
        column: "p2_id",
        name: "dc_s_fk2",
        deferrable: "immediate",
      });
      try {
        // Defer only fk2; fk1 is not deferrable so it stays immediate.
        await adapter.beginTransaction();
        try {
          await adapter.setConstraints("deferred", "dc_s_fk2");
          // INSERT violates fk1 (not deferred) — raises immediately.
          await expect(
            adapter.execute(`INSERT INTO dc_s_ch (p1_id, p2_id) VALUES (-1, -1)`),
          ).rejects.toThrow(InvalidForeignKey);
        } finally {
          await adapter.rollback().catch(() => {});
        }
      } finally {
        await adapter.execute(`DROP TABLE IF EXISTS dc_s_ch`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_s_p1`);
        await adapter.execute(`DROP TABLE IF EXISTS dc_s_p2`);
      }
    });

    it("set constraints requires valid value", async () => {
      await expect(adapter.setConstraints("invalid" as unknown as "deferred")).rejects.toThrow(
        /deferred must be/,
      );
    });
  });
});
