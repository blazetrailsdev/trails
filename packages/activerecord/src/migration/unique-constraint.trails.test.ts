import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { describeIfSupports } from "../support/supports.js";
import { createTestUniqueConstraintsTable } from "../support/load-schema-helper.js";
import { openScratchDatabase, type ScratchDatabase } from "../support/pg-scratch-database.js";

describeIfSupports("unique_constraints", "Migration", () => {
  let scratch: ScratchDatabase;
  let connection: PostgreSQLAdapter;

  beforeAll(async () => {
    scratch = await openScratchDatabase("unique_constraints_trails");
    connection = scratch.connection;
    await createTestUniqueConstraintsTable(connection);
  }, 30000);

  afterAll(async () => {
    await connection.dropTable("sections", { ifExists: true });
    await scratch.drop();
  }, 30000);

  beforeEach(async () => {
    await connection.createTable("sections", { force: true }, (t) => {
      t.integer("position", { null: false });
    });
  });

  describe("UniqueConstraintTrailsTest", () => {
    it("renders a missing column list the way Ruby renders an Array of Symbols", async () => {
      await expect(connection.removeUniqueConstraint("sections", ["position"])).rejects.toThrow(
        "Table 'sections' has no unique constraint for [:position]",
      );
    });

    it("renders a missing single column the way Ruby renders a Symbol", async () => {
      await expect(connection.removeUniqueConstraint("sections", "position")).rejects.toThrow(
        "Table 'sections' has no unique constraint for position",
      );
    });
  });
});
