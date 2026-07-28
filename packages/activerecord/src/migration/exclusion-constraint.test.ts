/**
 * Mirrors Rails activerecord/test/cases/migration/exclusion_constraint_test.rb
 * (PostgreSQL-only — `supports_exclusion_constraints?`).
 *
 * The model-backed arms (test_added_exclusion_constraint_ensures_valid_values,
 * test_added_deferrable_initially_immediate_exclusion_constraint) are not
 * ported here; this file covers the add/remove paths that
 * PostgreSQL::SchemaStatements#add_exclusion_constraint and
 * #remove_exclusion_constraint route through create_alter_table +
 * schema_creation.accept.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { PostgreSQLAdapter, PG_TEST_URL } from "../adapters/postgresql/test-helper.js";
import { describeIfSupports } from "../support/supports.js";
import { rebuildCanonicalTables } from "../support/canonical-table-rebuild.js";

const EXPRESSION = "daterange(start_date, end_date) WITH &&";

describeIfSupports("exclusion_constraints", "Migration", () => {
  let connection: PostgreSQLAdapter;

  beforeEach(async () => {
    connection = new PostgreSQLAdapter(PG_TEST_URL);
    await connection.createTable("invoices", { force: true }, (t) => {
      t.date("start_date");
      t.date("end_date");
    });
  });

  afterEach(async () => {
    await connection.dropTable("invoices", { ifExists: true });
    // Rails' setup replaces `invoices` with a start_date/end_date table and its
    // teardown drops it; restore the canonical shape so the shared per-worker
    // database does not drift for the files that run next.
    await rebuildCanonicalTables(connection, ["invoices"]);
    await connection.close();
  });

  describe("ExclusionConstraintTest", () => {
    it("exclusion constraints", async () => {
      const expectedExclusionConstraints = [
        {
          tableName: "test_exclusion_constraints",
          name: "test_exclusion_constraints_date_overlap",
          expression: "daterange(start_date, end_date) WITH &&",
          where: "(start_date IS NOT NULL) AND (end_date IS NOT NULL)",
          using: "gist",
          deferrable: false,
        },
        {
          tableName: "test_exclusion_constraints",
          name: "test_exclusion_constraints_valid_overlap",
          expression: "daterange(valid_from, valid_to) WITH &&",
          where: "(valid_from IS NOT NULL) AND (valid_to IS NOT NULL)",
          using: "gist",
          deferrable: "immediate",
        },
        {
          tableName: "test_exclusion_constraints",
          name: "test_exclusion_constraints_transaction_overlap",
          expression: "daterange(transaction_from, transaction_to) WITH &&",
          where: "(transaction_from IS NOT NULL) AND (transaction_to IS NOT NULL)",
          using: "gist",
          deferrable: "deferred",
        },
      ];

      const exclusionConstraints = await connection.exclusionConstraints(
        "test_exclusion_constraints",
      );
      expect(exclusionConstraints.length).toBe(expectedExclusionConstraints.length);

      for (const expected of expectedExclusionConstraints) {
        const constraint = exclusionConstraints.find((c) => c.name === expected.name)!;
        expect(constraint.tableName).toBe(expected.tableName);
        expect(constraint.name).toBe(expected.name);
        expect(constraint.expression).toBe(expected.expression);
        expect(constraint.using).toBe(expected.using);
        expect(constraint.where).toBe(expected.where);
        expect(constraint.deferrable).toBe(expected.deferrable);
      }
    });

    it("add exclusion constraint", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, { using: "gist" });

      const exclusionConstraints = await connection.exclusionConstraints("invoices");
      expect(exclusionConstraints.length).toBe(1);

      const constraint = exclusionConstraints[0];
      expect(constraint.tableName).toBe("invoices");
      expect(constraint.name).toBe("excl_rails_74c9160f55");
      expect(constraint.deferrable).toBe(false);
      expect(constraint.expression).toBe(EXPRESSION);
    });

    it("add exclusion constraint deferrable false", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, {
        using: "gist",
        deferrable: false,
      });

      const exclusionConstraints = await connection.exclusionConstraints("invoices");
      expect(exclusionConstraints.length).toBe(1);

      const constraint = exclusionConstraints[0];
      expect(constraint.name).toBe("excl_rails_74c9160f55");
      expect(constraint.deferrable).toBe(false);
      expect(constraint.expression).toBe(EXPRESSION);
    });

    it("add exclusion constraint deferrable initially immediate", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, {
        using: "gist",
        deferrable: "immediate",
      });

      const constraint = (await connection.exclusionConstraints("invoices"))[0];
      expect(constraint.name).toBe("excl_rails_74c9160f55");
      expect(constraint.deferrable).toBe("immediate");
      expect(constraint.expression).toBe(EXPRESSION);
    });

    it("add exclusion constraint deferrable initially deferred", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, {
        using: "gist",
        deferrable: "deferred",
      });

      const constraint = (await connection.exclusionConstraints("invoices"))[0];
      expect(constraint.name).toBe("excl_rails_74c9160f55");
      expect(constraint.deferrable).toBe("deferred");
      expect(constraint.expression).toBe(EXPRESSION);
    });

    it("add exclusion constraint deferrable invalid", async () => {
      await expect(
        connection.addExclusionConstraint("invoices", EXPRESSION, {
          using: "gist",
          deferrable: true as never,
        }),
        // Rails' message names the Ruby symbols `:immediate` / `:deferred`;
        // trails' analogues are the string literals, so the rendered message
        // quotes them instead.
      ).rejects.toThrow('deferrable must be `"immediate"` or `"deferred"`, got: `true`');
    });

    it("remove exclusion constraint", async () => {
      expect((await connection.exclusionConstraints("invoices")).length).toBe(0);

      await connection.addExclusionConstraint("invoices", EXPRESSION, {
        using: "gist",
        name: "invoices_date_overlap",
      });
      expect((await connection.exclusionConstraints("invoices")).length).toBe(1);

      await connection.removeExclusionConstraint("invoices", { name: "invoices_date_overlap" });
      expect((await connection.exclusionConstraints("invoices")).length).toBe(0);
    });

    it("remove non existing exclusion constraint", async () => {
      await expect(
        connection.removeExclusionConstraint("invoices", { name: "nonexistent" }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
