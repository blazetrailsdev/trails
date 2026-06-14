/**
 * Mirrors activerecord/test/cases/numeric_data_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";
import { adapterType } from "./test-adapter.js";

// Rails guards test_numeric_fields_with_nan with current_adapter?(:PostgreSQLAdapter):
// only PostgreSQL's numeric type stores NaN (SQLite/MySQL reject 'NaN'::numeric).
const itPg = adapterType === "postgres" ? it : it.skip;

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({ numeric_data: TEST_SCHEMA.numeric_data });
  await NumericData.loadSchema();
});

// Mirrors models/numeric_data.rb: world_population / my_house_population are
// declared big_integer (decimal-with-0-scale-as-integer is deprecated in Rails).
class NumericData extends Base {
  static _tableName = "numeric_data";
  static {
    this.attribute("world_population", "big_integer");
    this.attribute("my_house_population", "big_integer");
  }
}

describe("NumericDataTest", () => {
  it("big decimal conditions", async () => {
    const m = NumericData.new({
      bank_balance: 1586.43,
      big_bank_balance: "1000234000567.95",
      world_population: 6000000000,
      my_house_population: 3,
    });
    expect(await m.save()).toBe(true);
    expect(await NumericData.where("bank_balance > ?", 2000.0).count()).toBe(0);
  });

  it("numeric fields", async () => {
    const m = NumericData.new({
      bank_balance: 1586.43,
      big_bank_balance: "1000234000567.95",
      world_population: 2n ** 62n,
      my_house_population: 3,
    });
    expect(await m.save()).toBe(true);

    const m1 = await NumericData.findBy({
      bank_balance: 1586.43,
      big_bank_balance: "1000234000567.95",
    });

    expect(typeof m1!.world_population).toBe("bigint");
    expect(m1!.world_population).toBe(2n ** 62n);

    expect(typeof m1!.my_house_population).toBe("bigint");
    expect(m1!.my_house_population).toBe(3n);

    expect(m1!.bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.bank_balance as BigDecimal).toString("F")).toBe("1586.43");

    expect(m1!.big_bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.big_bank_balance as BigDecimal).toString("F")).toBe("1000234000567.95");
  });

  it("numeric fields with scale", async () => {
    const m = NumericData.new({
      bank_balance: 1586.43122334,
      big_bank_balance: "234000567.952344",
      world_population: 2n ** 62n,
      my_house_population: 3,
    });
    expect(await m.save()).toBe(true);

    const m1 = await NumericData.findBy({
      bank_balance: 1586.43122334,
      big_bank_balance: "234000567.952344",
    });

    expect(typeof m1!.world_population).toBe("bigint");
    expect(m1!.world_population).toBe(2n ** 62n);

    expect(typeof m1!.my_house_population).toBe("bigint");
    expect(m1!.my_house_population).toBe(3n);

    expect(m1!.bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.bank_balance as BigDecimal).toString("F")).toBe("1586.43");

    expect(m1!.big_bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.big_bank_balance as BigDecimal).toString("F")).toBe("234000567.95");
  });

  itPg("numeric fields with nan", async () => {
    // BigDecimal has no NaN form, so BigDecimal("NaN") (passed in as the JS
    // NaN) round-trips as the sentinel "NaN" rather than a BigDecimal — the
    // stand-in for Rails' `nan?` predicate.
    const m = NumericData.new({
      bank_balance: NaN,
      big_bank_balance: NaN,
      world_population: 2n ** 62n,
      my_house_population: 3,
    });
    expect(m.bank_balance).toBe("NaN");
    expect(m.big_bank_balance).toBe("NaN");
    expect(await m.save()).toBe(true);

    const m1 = await NumericData.findBy({
      bank_balance: NaN,
      big_bank_balance: NaN,
    });

    expect(m1!.bank_balance).toBe("NaN");
    expect(m1!.big_bank_balance).toBe("NaN");
  });
});
