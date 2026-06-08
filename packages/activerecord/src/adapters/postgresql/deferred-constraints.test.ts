/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/deferred_constraints_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { Base } from "../../index.js";
import { InvalidForeignKey } from "../../index.js";

describeIfPg("PostgreSQLAdapter", () => {
  setupHandlerSuite();

  let connection: PostgreSQLAdapter;
  let fk: string;
  let otherFk: string;

  beforeEach(async () => {
    connection = Base.connection as PostgreSQLAdapter;
    // Rails uses pre-existing authors/lessons_students with deferrable FKs.
    // We create minimal equivalent tables.
    await connection.execute("DROP TABLE IF EXISTS deferred_c2");
    await connection.execute("DROP TABLE IF EXISTS deferred_c1");
    await connection.execute("DROP TABLE IF EXISTS deferred_p");
    await connection.execute("CREATE TABLE deferred_p (id SERIAL PRIMARY KEY)");
    await connection.execute(
      `CREATE TABLE deferred_c1 (id SERIAL PRIMARY KEY, p_id INTEGER NOT NULL,
         CONSTRAINT fk_c1_p FOREIGN KEY (p_id) REFERENCES deferred_p(id) DEFERRABLE INITIALLY IMMEDIATE)`,
    );
    await connection.execute(
      `CREATE TABLE deferred_c2 (id SERIAL PRIMARY KEY, p_id INTEGER NOT NULL,
         CONSTRAINT fk_c2_p FOREIGN KEY (p_id) REFERENCES deferred_p(id) DEFERRABLE INITIALLY IMMEDIATE)`,
    );
    fk = (await connection.foreignKeys("deferred_c1"))[0].name!;
    otherFk = (await connection.foreignKeys("deferred_c2"))[0].name!;
  });

  afterEach(async () => {
    await connection.execute("DROP TABLE IF EXISTS deferred_c2");
    await connection.execute("DROP TABLE IF EXISTS deferred_c1");
    await connection.execute("DROP TABLE IF EXISTS deferred_p");
  });

  describe("PostgresqlDeferredConstraintsTest", () => {
    it("defer constraints", async () => {
      // Rails: SET CONSTRAINTS ALL DEFERRED; invalid insert; SET CONSTRAINTS ALL IMMEDIATE → raises
      await expect(
        connection.transaction(async () => {
          await connection.setConstraints("deferred");
          await connection.execute("INSERT INTO deferred_c1 (p_id) VALUES (-1)");
          await connection.setConstraints("immediate");
        }),
      ).rejects.toThrow(InvalidForeignKey);
    });

    it("defer constraints with specific fk", async () => {
      // Rails: SET CONSTRAINTS @fk DEFERRED; invalid insert; SET CONSTRAINTS @fk IMMEDIATE → raises
      await expect(
        connection.transaction(async () => {
          await connection.setConstraints("deferred", fk);
          await connection.execute("INSERT INTO deferred_c1 (p_id) VALUES (-1)");
          await connection.setConstraints("immediate", fk);
        }),
      ).rejects.toThrow(InvalidForeignKey);
    });

    it("defer constraints with multiple fks", async () => {
      // Rails: SET CONSTRAINTS @other_fk,@fk DEFERRED; invalid insert; IMMEDIATE → raises
      await expect(
        connection.transaction(async () => {
          await connection.setConstraints("deferred", otherFk, fk);
          await connection.execute("INSERT INTO deferred_c1 (p_id) VALUES (-1)");
          await connection.setConstraints("immediate", otherFk, fk);
        }),
      ).rejects.toThrow(InvalidForeignKey);
    });

    it("defer constraints only defers single fk", async () => {
      // Rails: defer @other_fk only; insert violating @fk → raises immediately
      await expect(
        connection.transaction(async () => {
          await connection.setConstraints("deferred", otherFk);
          // fk (deferred_c1) is not deferred — should raise right here
          await connection.execute("INSERT INTO deferred_c1 (p_id) VALUES (-1)");
        }),
      ).rejects.toThrow(InvalidForeignKey);
    });

    it("set constraints requires valid value", async () => {
      // Rails: assert_raises(ArgumentError) { @connection.set_constraints(:invalid) }
      await expect((connection as any).setConstraints("invalid")).rejects.toThrow();
    });
  });
});
