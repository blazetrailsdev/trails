import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { describeIfSupports } from "../support/supports.js";

/**
 * Ruby splits `remove_check_constraint(table_name, expression = nil, **options)`
 * into a positional expression plus keywords, so there is no Rails test for the
 * shape TS has to spell separately: expression as arg 2, `{ name }` as arg 3.
 * `Migration#removeCheckConstraint` (migration.ts) forwards exactly that form,
 * and an adapter override that drops arg 3 falls back to the hashed
 * expression-derived name and raises instead of removing.
 */
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

    it("removes by expression with the name supplied as trailing options", async () => {
      const connection = await ambientConnection();
      await connection.addCheckConstraint("trades", "price > 0", { name: "price_check" });

      await connection.removeCheckConstraint("trades", "price > 0", { name: "price_check" });

      expect(await connection.checkConstraints("trades")).toEqual([]);
    });
  });

  // Rails passes the whole option set to `check_constraint_for!`
  // (schema_statements.rb:1329), so `validate:` reaches
  // `CheckConstraintDefinition#defined_for?` (schema_definitions.rb:189) and a
  // mismatching value must not resolve the constraint. Only PostgreSQL records
  // an unvalidated (`NOT VALID`) constraint, so only there can the stored
  // `validate` disagree with the one being looked up.
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
