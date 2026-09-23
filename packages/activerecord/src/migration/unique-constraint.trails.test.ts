import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
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

    it("renders missing lookup options the way Ruby renders a Symbol-keyed Hash", async () => {
      const connection = (await ambientConnection()) as unknown as PostgreSQLAdapter;

      const error = await connection
        .removeUniqueConstraint("sections", { name: "nonexistent" })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ArgumentError);
      expect(error.message).toBe(
        `Table 'sections' has no unique constraint for {:name=>"nonexistent"}`,
      );
    });
  });
});
