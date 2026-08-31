import { describe, it, expect } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { describeIfSupports } from "../support/supports.js";

describe("Migration", () => {
  describeIfSupports("unique_constraints", "UniqueConstraintTrailsTest", () => {
    it("renders a missing column list the way Ruby renders an Array of Symbols", async () => {
      const connection = (await ambientConnection()) as unknown as PostgreSQLAdapter;

      await expect(connection.removeUniqueConstraint("sections", ["position"])).rejects.toThrow(
        "Table 'sections' has no unique constraint for [:position]",
      );
    });

    it("renders a missing single column the way Ruby renders a Symbol", async () => {
      const connection = (await ambientConnection()) as unknown as PostgreSQLAdapter;

      await expect(connection.removeUniqueConstraint("sections", "position")).rejects.toThrow(
        "Table 'sections' has no unique constraint for position",
      );
    });
  });
});
