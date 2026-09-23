import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { ambientConnection } from "../support/rocket-tables.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { describeIfSupports } from "../support/supports.js";

describe("Migration", () => {
  describeIfSupports("exclusion_constraints", "ExclusionConstraintTrailsTest", () => {
    it("renders missing lookup options the way Ruby renders a Symbol-keyed Hash", async () => {
      const connection = (await ambientConnection()) as unknown as PostgreSQLAdapter;

      const error = await connection
        .removeExclusionConstraint("invoices", { name: "nonexistent" })
        .catch((e) => e);
      expect(error).toBeInstanceOf(ArgumentError);
      expect(error.message).toBe(
        `Table 'invoices' has no exclusion constraint for {:name=>"nonexistent"}`,
      );
    });
  });
});
