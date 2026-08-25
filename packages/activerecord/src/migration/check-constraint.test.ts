import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Base } from "../base.js";
import { NotImplementedError, StatementInvalid } from "../errors.js";
import type { CheckConstraintDefinition } from "../connection-adapters/abstract/schema-definitions.js";
import type { ValidateConstraintStatements } from "../connection-adapters/abstract/schema-statements.js";
import { ambientConnection } from "../support/rocket-tables.js";
import { useTransactionalTests } from "../test-fixtures/use-transactional-tests.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "../support/supports.js";
import { adapterType } from "../test-adapter.js";
import { isMariaDb, serverVersion } from "../support/mysql-server-version.js";
import { dumpTableSchema } from "../support/schema-dumping-helper.js";
import type { SchemaSource } from "../schema-dumper.js";

// Rails' `if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` arm of
// `test_check_constraints` calls `json_schema_valid()`, which MySQL only ships
// from 8.0.17 and MariaDB does not have at all — and the CI mysql lane runs
// mariadb:11 (ci.yml:1186). Rails' own mysql lane is MySQL 8, so the adapter
// check alone is enough there; here the function's availability has to be read
// off the server the way every other version-keyed gate in
// support/mysql-server-version.ts does.
const supportsJsonSchemaValid = !isMariaDb && (serverVersion?.compare("8.0.17") ?? -1) >= 0;

const supportsCheckConstraints = adapterSupports("check_constraints");

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
    useTransactionalTests({
      usesTransaction: [
        "add check constraint with non existent table raises",
        "added check constraint ensures valid values",
        "not valid check constraint",
      ],
    });

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

      if (adapterType === "mysql") {
        await connection.createTable("constraint_test", { force: true }, (t) => {
          t.json("options", { default: null });
        });
      }

      void Trade.resetColumnInformation();
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("trades", "purchases", { ifExists: true });

      if (adapterType === "mysql") {
        await connection.dropTable("constraint_test", { ifExists: true });
      }

      void Trade.resetColumnInformation();
    });

    it("check constraints", async () => {
      const connection = await ambientConnection();
      const checkConstraints = await connection.checkConstraints("products");
      expect(checkConstraints.length).toBe(1);

      let constraint = checkConstraints[0];
      expect(constraint.tableName).toBe("products");
      expect(constraint.name).toBe("products_price_check");

      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` (check_constraint_test.rb:50-54)
      if (adapterType === "mysql") {
        expect(constraint.expression).toBe("`price` > `discounted_price`");
      } else {
        expect(constraint.expression).toBe("price > discounted_price");
      }

      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if current_adapter?(:Mysql2Adapter, :TrilogyAdapter)` (check_constraint_test.rb:57-70); see supportsJsonSchemaValid
      if (adapterType === "mysql" && supportsJsonSchemaValid) {
        try {
          await connection.addCheckConstraint(
            "constraint_test",
            'json_schema_valid(_utf8mb4\'\n        {\n          "oneOf": [\n            {\n              "type": "null"\n            },\n            {\n              "type": "array",\n              "minItems": 1,\n              "items": {\n                "type": "integer",\n                "minimum": 0\n              }\n            }\n          ]\n        }\',`options`)\n',
            { name: "non_empty_test_array" },
          );

          constraint = (await connection.checkConstraints("constraint_test")).find(
            (c) => c.name === "non_empty_test_array",
          )!;
          expect(constraint.expression).toContain("json_schema_valid");
          expect(constraint.expression).toBe(
            'json_schema_valid(_utf8mb4\' { "oneOf": [ { "type": "null" }, { "type": "array", "minItems": 1, "items": { "type": "integer", "minimum": 0 } } ] }\',`options`)',
          );
        } finally {
          await connection.removeCheckConstraint("constraint_test", {
            name: "non_empty_test_array",
            ifExists: true,
          });
        }
      }

      // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors Rails' inline `if current_adapter?(:PostgreSQLAdapter)` (check_constraint_test.rb:72-83)
      if (adapterType === "postgres") {
        try {
          // Test that complex expression is correctly parsed from the database
          await connection.addCheckConstraint(
            "trades",
            "CASE WHEN price IS NOT NULL THEN true ELSE false END",
            { name: "price_is_required" },
          );

          constraint = (await connection.checkConstraints("trades")).find(
            (c) => c.name === "price_is_required",
          )!;
          expect(constraint.expression).toContain("WHEN price IS NOT NULL");
        } finally {
          await connection.removeCheckConstraint("trades", { name: "price_is_required" });
        }
      }
    });

    it.runIf(adapterType === "postgres")("check constraints scoped to schemas", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0");

      const schemas = connection as unknown as {
        createSchema(name: string): Promise<void>;
        dropSchema(name: string): Promise<void>;
      };
      try {
        const before = (await connection.checkConstraints("trades")).length;
        await schemas.createSchema("test_schema");
        // eslint-disable-next-line blazetrails/require-table-teardown -- Rails' `ensure` drops the whole schema (check_constraint_test.rb:97-98), and PG's DROP SCHEMA is a CASCADE (postgresql/schema_statements.rb:70), so the table goes with it.
        await connection.createTable("test_schema.trades", {}, (t) => {
          t.integer("quantity");
        });
        await connection.addCheckConstraint("test_schema.trades", "quantity > 0");
        expect((await connection.checkConstraints("trades")).length).toBe(before);
      } finally {
        await schemas.dropSchema("test_schema");
      }
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

    itIfSupports("validate_constraints", "schema dumping with validate false", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: false,
      });

      const output = await dumpTableSchema(connection as unknown as SchemaSource, "trades");

      expect(output).toMatch(
        /\s+await ctx\.addCheckConstraint\("trades", "quantity > 0", \{ name: "quantity_check", validate: false \}\);$/m,
      );
    });

    itIfSupports("validate_constraints", "schema dumping with validate true", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "quantity > 0", {
        name: "quantity_check",
        validate: true,
      });

      const output = await dumpTableSchema(connection as unknown as SchemaSource, "trades");

      expect(output).toMatch(
        /\s+t\.checkConstraint\("quantity > 0", \{ name: "quantity_check" \}\);$/m,
      );
    });

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
        `Table 'trades' has no check constraint for {name: "quantity_check"}`,
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

  // Rails' `else` arm of the file-level `if
  // ActiveRecord::Base.lease_connection.supports_check_constraints?`
  // (check_constraint_test.rb:317-341). Held in a const so the `skipIf` call
  // site carries no feature literal: the gate extractor drops the negation, and
  // an inline `adapterSupports("check_constraints")` would tag the else-arm
  // cases with the very feature that excludes them.
  describe.skipIf(supportsCheckConstraints)("NoCheckConstraintSupportTest", () => {
    it("add check constraint should be noop", async () => {
      const connection = await ambientConnection();
      await assertNothingRaised(() =>
        connection.addCheckConstraint("products", "discounted_price > 0", {
          name: "discounted_price_check",
        }),
      );
    });

    it("remove check constraint should be noop", async () => {
      const connection = await ambientConnection();
      await assertNothingRaised(() =>
        connection.removeCheckConstraint("products", { name: "price_check" }),
      );
    });

    it("check constraints should raise not implemented", async () => {
      const connection = await ambientConnection();
      await expect(connection.checkConstraints("products")).rejects.toThrow(NotImplementedError);
    });
  });
});
