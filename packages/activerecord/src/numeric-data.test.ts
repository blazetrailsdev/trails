/**
 * Mirrors activerecord/test/cases/numeric_data_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    numeric_data: {
      bank_balance: { type: "decimal", precision: 10, scale: 2 },
      big_bank_balance: { type: "decimal", precision: 15, scale: 2 },
      world_population: { type: "decimal", precision: 20, scale: 0 },
      my_house_population: { type: "decimal", precision: 2, scale: 0 },
    },
  });
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

    expect(typeof m1!.bank_balance).toBe("string");
    expect(m1!.bank_balance).toBe("1586.43");

    expect(typeof m1!.big_bank_balance).toBe("string");
    expect(m1!.big_bank_balance).toBe("1000234000567.95");
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

    expect(typeof m1!.bank_balance).toBe("string");
    expect(m1!.bank_balance).toBe("1586.43");

    expect(typeof m1!.big_bank_balance).toBe("string");
    expect(m1!.big_bank_balance).toBe("234000567.95");
  });

  it.skip("numeric fields with nan", () => {
    // BLOCKED: type — PostgreSQL-only (BigDecimal("NaN")). DecimalType has no NaN
    // representation: numeric NaN casts to null and the string "NaN" casts to "0".
    // Faithful port needs a BigDecimal-NaN sentinel + 'NaN'::numeric serialization
    // (activemodel/type/decimal.ts + PG quoting). Separate from the TZ wiring shipped here.
  });
});
