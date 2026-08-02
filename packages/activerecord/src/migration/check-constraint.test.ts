import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import type { CheckConstraintDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { describeIfSupports } from "../support/supports.js";
import { adapterType } from "../test-adapter.js";

async function assertNothingRaised(block: () => Promise<unknown>): Promise<void> {
  await block();
}

function verifyPriceExpression(constraint: CheckConstraintDefinition): void {
  if (adapterType === "mysql") {
    expect(constraint.expression).toBe("`price` > 0");
  } else {
    expect(constraint.expression).toBe("price > 0");
  }
}

function assertEmpty(collection: CheckConstraintDefinition[]): void {
  if (collection.length !== 0)
    throw new Error(`Expected ${JSON.stringify(collection)} to be empty`);
}

describe("Migration", () => {
  describeIfSupports("check_constraints", "CheckConstraintTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      await connection.createTable("trades", { force: true }, (t) => {
        t.integer("price");
        t.integer("quantity");
      });
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("trades", { ifExists: true });
    });

    it("remove check constraint", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "price > 0", { name: "price_check" });
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });

      expect((await connection.checkConstraints("trades")).length).toBe(2);
      await connection.removeCheckConstraint("trades", { name: "quantity_check" });
      expect((await connection.checkConstraints("trades")).length).toBe(1);

      const constraint = (await connection.checkConstraints("trades"))[0];
      expect(constraint.tableName).toBe("trades");
      expect(constraint.name).toBe("price_check");

      verifyPriceExpression(constraint);

      await connection.removeCheckConstraint("trades", { name: "price_check" });
      assertEmpty(await connection.checkConstraints("trades"));
    });

    it("removing check constraint with if exists option", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });

      await assertNothingRaised(() =>
        connection.removeCheckConstraint("trades", { name: "quantity_check", ifExists: true }),
      );

      let error: Error | undefined;
      await expect(
        connection.removeCheckConstraint("trades", { name: "quantity_check" }).catch((e: Error) => {
          error = e;
          throw e;
        }),
      ).rejects.toThrow(ArgumentError);

      expect(error?.message).toBe(
        `Table 'trades' has no check constraint for ${JSON.stringify({ name: "quantity_check" })}`,
      );

      await assertNothingRaised(() =>
        connection.removeCheckConstraint("trades", { name: "quantity_check", ifExists: true }),
      );
    });

    it("remove non existing check constraint", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.removeCheckConstraint("trades", { name: "nonexistent" }),
      ).rejects.toThrow(ArgumentError);
    });
  });
});
