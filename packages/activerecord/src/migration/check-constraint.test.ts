import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { StatementInvalid } from "../errors.js";
import type { CheckConstraintDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import type { ValidateConstraintStatements } from "../connection-adapters/abstract/schema-statements.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "../support/supports.js";
import { adapterType } from "../test-adapter.js";

class Trade extends Base {
  static {
    this._tableName = "trades";
  }
}

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

      await connection.createTable("purchases", { force: true }, (t) => {
        t.integer("price");
        t.integer("quantity");
      });

      // Rails' setup also creates a `constraint_test` table on the MySQL lanes
      // for `test_check_constraints` (check_constraint_test.rb:27-31), which is
      // not ported yet.
      Trade.resetColumnInformation();
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("trades", "purchases", { ifExists: true });
      Trade.resetColumnInformation();
    });

    it("add check constraint", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0");

      const checkConstraints = await connection.checkConstraints("trades");
      expect(checkConstraints.length).toBe(1);

      const constraint = checkConstraints[0];
      expect(constraint.tableName).toBe("trades");
      expect(constraint.name).toBe("chk_rails_2189e9f96c");

      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` (check_constraint_test.rb:112-116)
      if (adapterType === "mysql") {
        expect(constraint.expression).toBe("`quantity` > 0");
      } else {
        expect(constraint.expression).toBe("quantity > 0");
      }
    });

    it("add check constraint with if not exists options", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0");

      await assertNothingRaised(() =>
        connection.addCheckConstraint("trades", "quantity > 0", { ifNotExists: true }),
      );
    });

    itIfSupports(
      "non_unique_constraint_name",
      "add constraint with same name to different table",
      async () => {
        const connection = await ambientConnection();
        await connection.addCheckConstraint("trades", "quantity > 0", {
          name: "greater_than_zero",
        });
        await connection.addCheckConstraint("purchases", "quantity > 0", {
          name: "greater_than_zero",
        });

        const tradesCheckConstraints = await connection.checkConstraints("trades");
        expect(tradesCheckConstraints.length).toBe(1);
        const tradeConstraint = tradesCheckConstraints[0];
        expect(tradeConstraint.tableName).toBe("trades");
        expect(tradeConstraint.name).toBe("greater_than_zero");

        const purchasesCheckConstraints = await connection.checkConstraints("purchases");
        expect(purchasesCheckConstraints.length).toBe(1);
        const purchaseConstraint = purchasesCheckConstraints[0];
        expect(purchaseConstraint.tableName).toBe("purchases");
        expect(purchaseConstraint.name).toBe("greater_than_zero");
      },
    );

    it("add check constraint with non existent table raises", async () => {
      const connection = await ambientConnection();
      let e: Error | undefined;
      await expect(
        connection
          .addCheckConstraint("refunds", "quantity > 0", { name: "quantity_check" })
          .catch((error: Error) => {
            e = error;
            throw error;
          }),
      ).rejects.toThrow(StatementInvalid);
      expect(e?.message).toMatch(/refunds/);
    });

    it("added check constraint ensures valid values", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });

      await expect(Trade.create({ quantity: -1 })).rejects.toThrow(StatementInvalid);
    });

    itIfSupports("validate_constraints", "not valid check constraint", async () => {
      const connection = await ambientConnection();
      await Trade.create({ quantity: -1 });

      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: false,
      });

      await expect(Trade.create({ quantity: -1 })).rejects.toThrow(StatementInvalid);
    });

    itIfSupports("validate_constraints", "validate check constraint by name", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: false,
      });
      expect((await connection.checkConstraints("trades"))[0].isValidate).toBe(false);

      await (connection as unknown as ValidateConstraintStatements).validateCheckConstraint(
        "trades",
        { name: "quantity_check" },
      );
      expect((await connection.checkConstraints("trades"))[0].isValidate).toBe(true);
    });

    itIfSupports("validate_constraints", "validated check constraint exists", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: false,
      });
      expect(
        await connection.checkConstraintExists("trades", {
          name: "quantity_check",
          validate: true,
        }),
      ).toBe(false);

      await (connection as unknown as ValidateConstraintStatements).validateCheckConstraint(
        "trades",
        { name: "quantity_check" },
      );
      expect(
        await connection.checkConstraintExists("trades", {
          name: "quantity_check",
          validate: true,
        }),
      ).toBe(true);
    });

    itIfSupports(
      "validate_constraints",
      "validate non existing check constraint raises",
      async () => {
        const connection = await ambientConnection();
        await expect(
          (connection as unknown as ValidateConstraintStatements).validateCheckConstraint(
            "trades",
            {
              name: "quantity_check",
            },
          ),
        ).rejects.toThrow(ArgumentError);
      },
    );

    // Check constraint should still be created, but should not be invalid
    it.skipIf(adapterSupports("validate_constraints"))("add invalid check constraint", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: false,
      });

      const checkConstraints = await connection.checkConstraints("trades");
      expect(checkConstraints.length).toBe(1);

      const cc = checkConstraints[0];
      expect(cc.isValidate).toBe(true);
    });

    it("check constraint exists", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });

      expect(await connection.checkConstraintExists("trades", { name: "quantity_check" })).toBe(
        true,
      );
      expect(await connection.checkConstraintExists("non_trades", { name: "quantity_check" })).toBe(
        false,
      );
      expect(await connection.checkConstraintExists("trades", { name: "other_check" })).toBe(false);
    });

    it("check constraint exists ensures required options", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });
      let error: Error | undefined;
      await expect(
        connection
          .checkConstraintExists("trades", { something: true } as { name?: string })
          .catch((e: Error) => {
            error = e;
            throw e;
          }),
      ).rejects.toThrow(ArgumentError);
      expect(error?.message).toBe("At least one of :name or :expression must be supplied");
    });

    itIfSupports("sql_standard_drop_constraint", "remove constraint", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", { name: "quantity_check" });

      expect((await connection.checkConstraints("trades")).length).toBe(1);
      await connection.removeConstraint("trades", "quantity_check");
      expect((await connection.checkConstraints("trades")).length).toBe(0);
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

    it("add constraint from change table with options", async () => {
      const connection = await ambientConnection();
      await connection.changeTable("trades", async (t) => {
        await t.checkConstraint("price > 0", { name: "price_check" });
      });

      const constraint = (await connection.checkConstraints("trades"))[0];
      expect(constraint.tableName).toBe("trades");
      expect(constraint.name).toBe("price_check");
    });

    it("remove constraint from change table with options", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "price > 0", { name: "price_check" });

      await connection.changeTable("trades", async (t) => {
        await t.removeCheckConstraint("price > 0", { name: "price_check" });
      });

      expect((await connection.checkConstraints("trades")).length).toBe(0);
    });
  });
});
