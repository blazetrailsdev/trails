import { describe, it, expect, beforeAll } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Base } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { adapterType } from "./test-adapter.js";

fixtures([]);

beforeAll(async () => {
  await NumericData.loadSchema();
});

class NumericData extends Base {
  declare bank_balance: unknown;
  declare big_bank_balance: unknown;
  declare my_house_population: unknown;
  declare world_population: unknown;
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

    expect(typeof m1!.my_house_population).toBe("number");
    expect(m1!.my_house_population).toBe(3);

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

    expect(typeof m1!.my_house_population).toBe("number");
    expect(m1!.my_house_population).toBe(3);

    expect(m1!.bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.bank_balance as BigDecimal).toString("F")).toBe("1586.43");

    expect(m1!.big_bank_balance).toBeInstanceOf(BigDecimal);
    expect((m1!.big_bank_balance as BigDecimal).toString("F")).toBe("234000567.95");
  });

  it.skipIf(adapterType !== "postgres")("numeric fields with nan", async () => {
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
