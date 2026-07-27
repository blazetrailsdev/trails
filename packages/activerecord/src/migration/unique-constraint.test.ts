/**
 * Mirrors Rails activerecord/test/cases/migration/unique_constraint_test.rb
 * (PostgreSQL-only — `supports_unique_constraints?`).
 *
 * The model-backed and schema-scoped arms, and the arms that need Rails'
 * `test_unique_constraints` fixture table, are not ported here.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  describeIfPg,
  PostgreSQLAdapter,
  PG_TEST_URL,
} from "../adapters/postgresql/test-helper.js";
import { rebuildCanonicalTables } from "../support/canonical-schema.js";

describeIfPg("ActiveRecord::Migration", () => {
  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = new PostgreSQLAdapter(PG_TEST_URL);
    await connection.createTable("sections", { force: true }, (t) => {
      t.integer("position", { null: false });
    });
  });

  afterEach(async () => {
    await connection.dropTable("sections", { ifExists: true });
    // Rails' setup replaces `sections` with a single-column table and its
    // teardown drops it; restore the canonical shape so the shared per-worker
    // database does not drift for the files that run next.
    await rebuildCanonicalTables(connection, ["sections"]);
    await connection.close();
  });

  describe("UniqueConstraintTest", () => {
    it("add unique constraint without deferrable", async () => {
      await connection.addUniqueConstraint("sections", ["position"]);

      const uniqueConstraints = await connection.uniqueConstraints("sections");
      expect(uniqueConstraints.length).toBe(1);

      const constraint = uniqueConstraints[0];
      expect(constraint.tableName).toBe("sections");
      expect(constraint.name).toBe("uniq_rails_1e07660b77");
      expect(constraint.deferrable).toBe(false);
    });

    it("add unique constraint with deferrable false", async () => {
      await connection.addUniqueConstraint("sections", ["position"], { deferrable: false });

      const constraint = (await connection.uniqueConstraints("sections"))[0];
      expect(constraint.name).toBe("uniq_rails_1e07660b77");
      expect(constraint.deferrable).toBe(false);
    });

    it("add unique constraint with deferrable immediate", async () => {
      await connection.addUniqueConstraint("sections", ["position"], { deferrable: "immediate" });

      const constraint = (await connection.uniqueConstraints("sections"))[0];
      expect(constraint.name).toBe("uniq_rails_1e07660b77");
      expect(constraint.deferrable).toBe("immediate");
    });

    it("add unique constraint with deferrable deferred", async () => {
      await connection.addUniqueConstraint("sections", ["position"], { deferrable: "deferred" });

      const constraint = (await connection.uniqueConstraints("sections"))[0];
      expect(constraint.name).toBe("uniq_rails_1e07660b77");
      expect(constraint.deferrable).toBe("deferred");
    });

    it("add unique constraint with deferrable invalid", async () => {
      await expect(
        connection.addUniqueConstraint("sections", ["position"], { deferrable: true as never }),
      ).rejects.toThrow(ArgumentError);
    });

    it("add unique constraint with name and using index", async () => {
      await connection.addIndex("sections", ["position"], { name: "unique_index", unique: true });
      await connection.addUniqueConstraint("sections", null, {
        name: "unique_constraint",
        deferrable: "immediate",
        usingIndex: "unique_index",
      });

      const uniqueConstraints = await connection.uniqueConstraints("sections");
      expect(uniqueConstraints.length).toBe(1);

      const constraint = uniqueConstraints[0];
      expect(constraint.tableName).toBe("sections");
      expect(constraint.name).toBe("unique_constraint");
      expect(constraint.column).toEqual(["position"]);
      expect(constraint.deferrable).toBe("immediate");
    });

    it("add unique constraint with only using index", async () => {
      await connection.addIndex("sections", ["position"], { name: "unique_index", unique: true });
      await connection.addUniqueConstraint("sections", null, { usingIndex: "unique_index" });

      const constraint = (await connection.uniqueConstraints("sections"))[0];
      expect(constraint.name).toBe("uniq_rails_79b901ffb4");
      expect(constraint.column).toEqual(["position"]);
      expect(constraint.deferrable).toBe(false);
    });

    it("add unique constraint with columns and using index", async () => {
      await connection.addIndex("sections", ["position"], { name: "unique_index", unique: true });

      await expect(
        connection.addUniqueConstraint("sections", ["position"], { usingIndex: "unique_index" }),
      ).rejects.toThrow(ArgumentError);
    });

    it("remove unique constraint", async () => {
      await connection.addUniqueConstraint("sections", ["position"], {
        name: "unique_section_position",
      });
      expect((await connection.uniqueConstraints("sections")).length).toBe(1);

      await connection.removeUniqueConstraint("sections", { name: "unique_section_position" });
      expect(await connection.uniqueConstraints("sections")).toEqual([]);
    });

    it("remove unique constraint by column", async () => {
      await connection.addUniqueConstraint("sections", ["position"]);
      expect((await connection.uniqueConstraints("sections")).length).toBe(1);

      await connection.removeUniqueConstraint("sections", ["position"]);
      expect(await connection.uniqueConstraints("sections")).toEqual([]);
    });

    it("remove non existing unique constraint", async () => {
      await expect(
        connection.removeUniqueConstraint("sections", { name: "nonexistent" }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
