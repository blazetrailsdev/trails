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
    it("defer constraints", async () => {
      await adapter.execute(`DROP TABLE IF EXISTS dc_par`);
      await adapter.execute(`DROP TABLE IF EXISTS dc_ch`);
      await adapter.execute(`CREATE TABLE dc_par (id SERIAL PRIMARY KEY)`);
      await adapter.execute(`CREATE TABLE dc_ch (id SERIAL PRIMARY KEY, par_id INT NOT NULL)`);
      try {
        await adapter.addForeignKey("dc_ch", "dc_par", {
          column: "par_id",
          name: "dc_ch_fk",
          deferrable: "immediate",
        });
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
      try {
        await adapter.addForeignKey("dc_ch", "dc_par", {
          column: "par_id",
          name: "dc_ch_fk",
          deferrable: "immediate",
        });
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
      try {
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
      try {
        // FK1 is deferrable but not in the SET CONSTRAINTS list — stays at INITIALLY IMMEDIATE.
        // Mirrors Rails: @fk (authors.author_address_id) is DEFERRABLE INITIALLY IMMEDIATE.
        await adapter.addForeignKey("dc_s_ch", "dc_s_p1", {
          column: "p1_id",
          name: "dc_s_fk1",
          deferrable: "immediate",
        });
        // FK2 is deferrable — can be set to deferred.
        await adapter.addForeignKey("dc_s_ch", "dc_s_p2", {
          column: "p2_id",
          name: "dc_s_fk2",
          deferrable: "immediate",
        });
        // Defer only fk2; fk1 is not deferrable so it stays immediate.
        await adapter.beginTransaction();
        try {
          await adapter.setConstraints("deferred", "dc_s_fk2");
          // fk1 is deferrable but not listed — stays INITIALLY IMMEDIATE → raises immediately.
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
