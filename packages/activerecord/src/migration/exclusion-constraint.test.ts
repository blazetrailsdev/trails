import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { Rollback, StatementInvalid } from "../errors.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { describeIfSupports } from "../support/supports.js";
import { createTestExclusionConstraintsTable } from "../support/load-schema-helper.js";
import { openScratchDatabase, type ScratchDatabase } from "../support/pg-scratch-database.js";

const EXPRESSION = "daterange(start_date, end_date) WITH &&";

class Invoice extends Base {}

describeIfSupports("exclusion_constraints", "Migration", () => {
  let scratch: ScratchDatabase;
  let connection: PostgreSQLAdapter;

  beforeAll(async () => {
    scratch = await openScratchDatabase("exclusion_constraints");
    connection = scratch.connection;
    await createTestExclusionConstraintsTable(connection);
    (Invoice as unknown as { _adapter: PostgreSQLAdapter })._adapter = connection;
  }, 30000);

  afterAll(async () => {
    await scratch.drop();
  }, 30000);

  beforeEach(async () => {
    await connection.createTable("invoices", { force: true }, (t) => {
      t.date("start_date");
      t.date("end_date");
    });
  });

  afterEach(async () => {
    await connection.dropTable("invoices", { ifExists: true });
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

    it("exclusion constraints scoped to schemas", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, { using: "gist" });

      const before = (await connection.exclusionConstraints("invoices")).length;
      try {
        await connection.createSchema("test_schema");
        // eslint-disable-next-line blazetrails/require-table-teardown -- dropped with its schema by the `dropSchema("test_schema")` in the finally block
        await connection.createTable("test_schema.invoices", {}, (t) => {
          t.date("start_date");
          t.date("end_date");
        });
        await connection.addExclusionConstraint("test_schema.invoices", EXPRESSION, {
          using: "gist",
        });
        expect((await connection.exclusionConstraints("invoices")).length).toBe(before);
      } finally {
        await connection.dropSchema("test_schema");
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
      ).rejects.toThrow('deferrable must be `"immediate"` or `"deferred"`, got: `true`');
    });

    it("added exclusion constraint ensures valid values", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, { using: "gist" });

      await Invoice.create({ start_date: "2020-01-01", end_date: "2021-01-01" });

      await expect(
        Invoice.create({ start_date: "2020-12-31", end_date: "2021-01-01" }),
      ).rejects.toThrow(StatementInvalid);
    });

    it("added deferrable initially immediate exclusion constraint", async () => {
      await connection.addExclusionConstraint("invoices", EXPRESSION, {
        using: "gist",
        deferrable: "immediate",
        name: "invoices_date_overlap",
      });

      const invoice = await Invoice.create({ start_date: "2020-01-01", end_date: "2021-01-01" });

      await expect(
        Invoice.transaction(
          async () => {
            await Invoice.createBang({ start_date: "2020-12-31", end_date: "2021-01-01" });
          },
          { requiresNew: true },
        ),
      ).rejects.toThrow(StatementInvalid);

      await expect(
        Invoice.transaction(
          async () => {
            await ((await Invoice.leaseConnection()) as PostgreSQLAdapter).setConstraints(
              "deferred",
              "invoices_date_overlap",
            );
            await Invoice.createBang({ start_date: "2020-12-31", end_date: "2021-01-01" });
            await invoice.updateBang({ end_date: "2020-12-31" });

            throw new Rollback();
          },
          { requiresNew: true },
        ),
      ).resolves.not.toThrow();
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
