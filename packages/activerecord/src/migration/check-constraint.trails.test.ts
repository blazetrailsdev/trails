import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { describeIfSupports } from "../support/supports.js";
import { adapterType } from "../test-adapter.js";

describe("Migration", () => {
  describeIfSupports("check_constraints", "CheckConstraintTrailsTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      await connection.createTable("trades", { force: true }, (t) => {
        t.integer("price");
      });
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("trades", { ifExists: true });
    });

    it.skipIf(adapterType !== "sqlite")(
      "reads back a check constraint nested deeper than two parenthesis levels",
      async () => {
        const connection = await ambientConnection();
        const expression = "price > (abs((price - (0 + 1))) - 1)";
        await connection.addCheckConstraint("trades", expression, { name: "deep_check" });

        const [constraint] = await connection.checkConstraints("trades");
        expect(constraint.name).toBe("deep_check");
        expect(constraint.expression).toBe(expression);
      },
    );

    it("removes by expression with the name supplied as trailing options", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "price > 0", { name: "price_check" });

      await connection.removeCheckConstraint("trades", "price > 0", { name: "price_check" });

      expect(await connection.checkConstraints("trades")).toEqual([]);
    });
  });

  describeIfSupports("validate_constraints", "CheckConstraintValidateLookupTrailsTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      await connection.createTable("trades", { force: true }, (t) => {
        t.integer("price");
      });
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("trades", { ifExists: true });
    });

    it("does not remove a check constraint whose validate does not match", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "price > 0", {
        name: "price_check",
        validate: false,
      });

      await expect(
        connection.removeCheckConstraint("trades", "price > 0", {
          name: "price_check",
          validate: true,
        }),
      ).rejects.toThrow(/has no check constraint/);

      expect(await connection.checkConstraints("trades")).toHaveLength(1);
    });
  });
});
