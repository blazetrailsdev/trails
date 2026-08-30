import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { Rollback, StatementInvalid } from "../errors.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { describeIfSupports } from "../support/supports.js";
import { createTestUniqueConstraintsTable } from "../support/load-schema-helper.js";
import { openScratchDatabase, type ScratchDatabase } from "../support/pg-scratch-database.js";

class Section extends Base {}

describeIfSupports("unique_constraints", "Migration", () => {
  let scratch: ScratchDatabase;
  let connection: PostgreSQLAdapter;

  beforeAll(async () => {
    scratch = await openScratchDatabase("unique_constraints");
    connection = scratch.connection;
    await createTestUniqueConstraintsTable(connection);
    (Section as unknown as { _adapter: PostgreSQLAdapter })._adapter = connection;
  }, 30000);

  afterAll(async () => {
    await scratch.drop();
  }, 30000);

  beforeEach(async () => {
    await connection.createTable("sections", { force: true }, (t) => {
      t.integer("position", { null: false });
    });
  });

  afterEach(async () => {
    await connection.dropTable("sections", { ifExists: true });
  });

  describe("UniqueConstraintTest", () => {
    it("unique constraints", async () => {
      const uniqueConstraints = await connection.uniqueConstraints("test_unique_constraints");

      const expectedConstraints = [
        {
          name: "test_unique_constraints_position_deferrable_false",
          deferrable: false,
          column: ["position_1"],
        },
        {
          name: "test_unique_constraints_position_deferrable_immediate",
          deferrable: "immediate",
          column: ["position_2"],
        },
        {
          name: "test_unique_constraints_position_deferrable_deferred",
          deferrable: "deferred",
          column: ["position_3"],
        },
        {
          name: "test_unique_constraints_position_nulls_not_distinct",
          nullsNotDistinct: true,
          column: ["position_4"],
        },
      ];

      expect(uniqueConstraints.length).toBe(expectedConstraints.length);

      const expectedNullsNotDistinct = expectedConstraints.pop()!;

      for (const expected of expectedConstraints) {
        const constraint = uniqueConstraints.find((c) => c.name === expected.name)!;
        expect(constraint.tableName).toBe("test_unique_constraints");
        expect(constraint.name).toBe(expected.name);
        expect(constraint.column).toEqual(expected.column);
        expect(constraint.deferrable).toBe(expected.deferrable);
      }

      await connection.getDatabaseVersion();
      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if supports_nulls_not_distinct?` guard (PG 15+)
      if (await connection.supportsNullsNotDistinct()) {
        const constraint = uniqueConstraints.find((c) => c.name === expectedNullsNotDistinct.name)!;
        expect(constraint.tableName).toBe("test_unique_constraints");
        expect(constraint.name).toBe(expectedNullsNotDistinct.name);
        expect(constraint.column).toEqual(expectedNullsNotDistinct.column);
        expect(constraint.nullsNotDistinct).toBe(expectedNullsNotDistinct.nullsNotDistinct);
      }
    });

    it("unique constraints scoped to schemas", async () => {
      await connection.addUniqueConstraint("sections", ["position"]);

      const before = (await connection.uniqueConstraints("sections")).length;
      try {
        await connection.createSchema("test_schema");
        // eslint-disable-next-line blazetrails/require-table-teardown -- dropped with its schema by the `dropSchema("test_schema")` in the finally block
        await connection.createTable("test_schema.sections", {}, (t) => {
          t.integer("position");
        });
        await connection.addUniqueConstraint("test_schema.sections", ["position"]);
        expect((await connection.uniqueConstraints("sections")).length).toBe(before);
      } finally {
        await connection.dropSchema("test_schema");
      }
    });

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

    it("added deferrable initially immediate unique constraint", async () => {
      await connection.addUniqueConstraint("sections", ["position"], {
        deferrable: "immediate",
        name: "unique_section_position",
      });

      const section = await Section.createBang({ position: 1 });

      await expect(
        Section.transaction(
          async () => {
            await Section.createBang({ position: 1 });
            await section.updateBang({ position: 2 });
          },
          { requiresNew: true },
        ),
      ).rejects.toThrow(StatementInvalid);

      await expect(
        Section.transaction(
          async () => {
            await (
              await Section.leaseConnection()
            ).execQuery("SET CONSTRAINTS unique_section_position DEFERRED");
            await Section.createBang({ position: 1 });
            await section.updateBang({ position: 2 });

            throw new Rollback();
          },
          { requiresNew: true },
        ),
      ).resolves.not.toThrow();
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

    it("renamed unique constraint", async () => {
      await connection.addUniqueConstraint("sections", ["position"]);
      await connection.renameColumn("sections", "position", "new_position");

      const uniqueConstraints = await connection.uniqueConstraints("sections");
      expect(uniqueConstraints.length).toBe(1);

      const constraint = uniqueConstraints[0];
      expect(constraint.tableName).toBe("sections");
      expect(constraint.column).toEqual(["new_position"]);
    });
  });
});
