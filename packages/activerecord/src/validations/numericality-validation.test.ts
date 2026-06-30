/**
 * Mirrors: activerecord/test/cases/validations/numericality_validation_test.rb
 *
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { DecimalType } from "@blazetrails/activemodel";
import { Base } from "../index.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { NumericData } from "../test-helpers/models/numeric-data.js";

setupFixtures();

beforeAll(async () => {
  await NumericData.loadSchema();
});

describe("NumericalityValidationTest", () => {
  // Rails: `@model_class = NumericData.dup`. A fresh subclass per test so the
  // `validates_numericality_of` declaration does not leak across tests.
  function modelClass(): typeof NumericData {
    return class extends NumericData {
      static name = "NumericData";
    };
  }

  it("column with precision", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("unscaled_bank_balance", {
      equalTo: 10_000_000.12,
    });

    const subject = modelClassVar.new({ unscaled_bank_balance: 10_000_000.121 });

    expect(subject.isValid()).toBe(true);
  });

  it("column with precision higher than double fig", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("decimal_number_big_precision", {
      equalTo: 10_000_000.3,
    });

    const subject = modelClassVar.new({ decimal_number_big_precision: 10_000_000.3 });

    expect(subject.isValid()).toBe(true);
  });

  it("column with scale", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("bank_balance", { greaterThan: 10 });

    const subject = modelClassVar.new({ bank_balance: 10.001 });

    expect(subject.isValid()).toBe(false);
  });

  it("no column precision", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("decimal_number", {
      equalTo: 1_000_000_000.123454,
    });

    const subject = modelClassVar.new({ decimal_number: 1_000_000_000.1234545 });

    expect(subject.isValid()).toBe(true);
  });

  it("virtual attribute", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType());
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", {
      equalTo: 1_000_000_000.123454,
    });

    const subject = modelClassVar.new({ virtual_decimal_number: 1_000_000_000.1234545 });

    expect(subject.isValid()).toBe(true);
  });

  it("on abstract class", () => {
    class AbstractClass extends Base {
      static {
        this.abstractClass = true;
        this.validates("bank_balance", { numericality: { equalTo: 10_000_000.12 } });
      }
    }

    class MyClass extends AbstractClass {
      static _tableName = "numeric_data";
      static name = "MyClass";
    }
    const subject = MyClass.new({ bank_balance: 10_000_000.12 });

    expect(subject.isValid()).toBe(true);
  });

  it("virtual attribute without precision", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType());
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", {
      equalTo: new BigDecimal("65.6"),
    });

    const subject = modelClassVar.new({ virtual_decimal_number: 65.6 });

    expect(subject.isValid()).toBe(true);
  });

  it("virtual attribute with precision round down", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType({ precision: 5 }));
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", { equalTo: 123.45 });

    const subject = modelClassVar.new({ virtual_decimal_number: 123.454 });

    expect(subject.isValid()).toBe(true);
  });

  it("virtual attribute with precision round half even", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType({ precision: 5 }));
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", { equalTo: 123.45 });

    const subject = modelClassVar.new({ virtual_decimal_number: 123.455 });

    // BigDecimal's to_d behavior changed in BigDecimal 3.1.0, see
    // https://github.com/ruby/bigdecimal/issues/70 — under 3.1.0+ this rounds
    // away from the equal_to target and is therefore invalid.
    expect(subject.isValid()).toBe(false);
  });

  it("virtual attribute with precision round up", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType({ precision: 5 }));
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", { equalTo: 123.45 });

    const subject = modelClassVar.new({ virtual_decimal_number: 123.456 });

    expect(subject.isValid()).toBe(false);
  });

  it("virtual attribute with scale", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType({ scale: 2 }));
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", { greaterThan: 1 });

    const subject = modelClassVar.new({ virtual_decimal_number: 1.001 });

    expect(subject.isValid()).toBe(false);
  });

  it("virtual attribute with precision and scale", () => {
    const modelClassVar = modelClass();
    modelClassVar.attribute("virtual_decimal_number", new DecimalType({ precision: 4, scale: 2 }));
    modelClassVar.validatesNumericalityOf("virtual_decimal_number", {
      lessThanOrEqualTo: 99.99,
    });

    for (const rawValue of ["99.994", 99.994, new BigDecimal("99.994")]) {
      const subject = modelClassVar.new({ virtual_decimal_number: rawValue });
      expect((subject.virtual_decimal_number as BigDecimal).toString("F")).toBe(
        new BigDecimal("99.99").toString("F"),
      );
      expect(subject.isValid()).toBe(true);
    }

    for (const rawValue of ["99.999", 99.999, new BigDecimal("99.999")]) {
      const subject = modelClassVar.new({ virtual_decimal_number: rawValue });
      expect((subject.virtual_decimal_number as BigDecimal).toString("F")).toBe(
        new BigDecimal("100.00").toString("F"),
      );
      expect(subject.isValid()).toBe(false);
    }
  });

  it("aliased attribute", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("newBankBalance", { greaterOrEqualThan: 0 });

    const subject = modelClassVar.new({ newBankBalance: "abcd" });

    expect(subject.isValid()).toBe(false);
  });

  it("allow nil works for casted value", () => {
    const modelClassVar = modelClass();
    modelClassVar.validatesNumericalityOf("bank_balance", { greaterThan: 0, allowNil: true });

    const subject = modelClassVar.new({ bank_balance: "" });

    expect(subject.isValid()).toBe(true);
  });
});
