import { describe, it, expect, afterEach } from "vitest";
import {
  assertPredicate,
  assertNotPredicate,
  BigDecimal,
  NumberHelper,
  Range,
} from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { ArgumentError } from "../attribute-assignment.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
// Rails' Topic declares `attr_accessor :approved` with no type, which is the
// untyped ValueType here (type/registry.ts:47). `price` is an `attr_writer`
// plus a `number_to_currency` reader, NOT an attribute, so it is a plain field
// whose raw value is reached through Rails' `attribute_before_type_cast`
// override (topic.rb:56-58), reached through the `_before_type_cast` suffix
// Topic declares for itself (topic.rb:10-11).
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("content", "string");
    this.attribute("approved", "value");
    this.attributeMethodSuffix("BeforeTypeCast", { parameters: false });
    this.defineAttributeMethod("price");
  }

  // Rails' `@price` ivar. Declared without an initializer because
  // `_assignAttributes` runs inside Model's constructor, before a subclass
  // field initializer would have run — an initialized `#price` is unwritable
  // at that point.
  declare _price: unknown;

  set price(value: unknown) {
    this._price = value;
  }

  get price(): string | null {
    return NumberHelper.numberToCurrency(this._price as number);
  }

  get rawPrice(): unknown {
    return this._price;
  }

  conditionIsFalse(): boolean {
    return false;
  }

  // Mirrors: topic.rb:56-58 — the dispatch target of the `_before_type_cast`
  // suffix, reading the ivar directly.
  attributeBeforeTypeCast(attr: string): unknown {
    if (attr === "price") return this._price;
    return this.readAttributeBeforeTypeCast(attr);
  }
}

// Mirrors: activemodel/test/models/person.rb — `attr_accessor :karma`.
class Person extends Model {
  static {
    this.attribute("karma", "value");
  }
}

/**
 * Mirrors `test_validates_numericality_with_object_acting_as_numeric`'s
 * anonymous `Class.new { def to_f; 123.54; end }` — `Kernel.Float` honors
 * `to_f` on a non-Numeric object, so numericality accepts it.
 */
class ActingAsNumeric {
  toF(): number {
    return 123.54;
  }
}

describe("NumericalityValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  const NIL = [null];
  const BLANK = ["", " ", " \t \r \n"];
  const BIGDECIMAL_STRINGS = ["12345678901234567890.1234567890"];
  const FLOAT_STRINGS = [
    "0.0",
    "+0.0",
    "-0.0",
    "10.0",
    "10.5",
    "-10.5",
    "-0.0001",
    "-090.1",
    "90.1e1",
    "-90.1e5",
    "-90.1e-5",
    "90e-5",
  ];
  const INTEGER_STRINGS = ["0", "+0", "-0", "10", "+10", "-10", "0090", "-090"];
  // Rails' list is [0.0, 10.0, 10.5, -10.5, -0.0001]. JS has one numeric type,
  // so `0.0 === 0` and `10.0 === 10` — a "Float that happens to be integral" is
  // not expressible, and those two entries would be NUMERIC_INTEGERS members
  // rather than the integer-only-rejecting Floats Rails means them to be. The
  // distinction is still covered by FLOAT_STRINGS' "0.0" / "10.0".
  const NUMERIC_FLOATS = [10.5, -10.5, -0.0001];
  const NUMERIC_INTEGERS = [0, 10, -10];
  const FLOATS = [...NUMERIC_FLOATS, ...FLOAT_STRINGS];
  const INTEGERS = [...NUMERIC_INTEGERS, ...INTEGER_STRINGS];
  const BIGDECIMAL = BIGDECIMAL_STRINGS.map((bd) => new BigDecimal(bd));
  const JUNK = [
    "not a number",
    "42 not a number",
    "0xdeadbeef",
    "-0xdeadbeef",
    "+0xdeadbeef",
    "0xinvalidhex",
    "0Xdeadbeef",
    "00-1",
    "--3",
    "+-3",
    "+3-1",
    "-+019.0",
    "12.12.13.12",
    "123\nnot a number",
  ];
  const INFINITY = [1.0 / 0.0];

  it("default validates numericality of", async () => {
    Topic.validatesNumericalityOf("approved");
    await assertInvalidValues([...NIL, ...BLANK, ...JUNK]);
    await assertValidValues([...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with nil allowed", async () => {
    Topic.validatesNumericalityOf("approved", { allowNil: true });

    await assertInvalidValues([...JUNK, ...BLANK]);
    await assertValidValues([...NIL, ...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with blank allowed", async () => {
    Topic.validatesNumericalityOf("approved", { allowBlank: true });

    await assertInvalidValues(JUNK);
    await assertValidValues([...NIL, ...BLANK, ...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with integer only", async () => {
    Topic.validatesNumericalityOf("approved", { onlyInteger: true });

    await assertInvalidValues([...NIL, ...BLANK, ...JUNK, ...FLOATS, ...BIGDECIMAL, ...INFINITY]);
    await assertValidValues(INTEGERS);
  });

  it("validates numericality of with integer only and nil allowed", async () => {
    Topic.validatesNumericalityOf("approved", { onlyInteger: true, allowNil: true });

    await assertInvalidValues([...JUNK, ...BLANK, ...FLOATS, ...BIGDECIMAL, ...INFINITY]);
    await assertValidValues([...NIL, ...INTEGERS]);
  });

  it("validates numericality of with integer only and symbol as value", async () => {
    Topic.validatesNumericalityOf("approved", { onlyInteger: ":conditionIsFalse" });

    await assertInvalidValues([...NIL, ...BLANK, ...JUNK]);
    await assertValidValues([...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with integer only and proc as value", async () => {
    defineIsAllowOnlyIntegers();
    Topic.validatesNumericalityOf("approved", {
      onlyInteger: (topic: Topic) => (topic as unknown as AllowOnlyIntegers).isAllowOnlyIntegers(),
    });

    await assertInvalidValues([...NIL, ...BLANK, ...JUNK]);
    await assertValidValues([...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with integer only and lambda as value", async () => {
    Topic.validatesNumericalityOf("approved", { onlyInteger: () => false });

    await assertInvalidValues([...NIL, ...BLANK, ...JUNK]);
    await assertValidValues([...FLOATS, ...INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with numeric only", async () => {
    Topic.validatesNumericalityOf("approved", { onlyNumeric: true });

    await assertInvalidValues([...NIL, ...BLANK, ...JUNK, ...FLOAT_STRINGS, ...INTEGER_STRINGS]);
    await assertValidValues([...NUMERIC_FLOATS, ...NUMERIC_INTEGERS, ...BIGDECIMAL, ...INFINITY]);
  });

  it("validates numericality of with numeric only and nil allowed", async () => {
    Topic.validatesNumericalityOf("approved", { onlyNumeric: true, allowNil: true });

    await assertInvalidValues([...JUNK, ...BLANK, ...FLOAT_STRINGS, ...INTEGER_STRINGS]);
    await assertValidValues([
      ...NIL,
      ...NUMERIC_FLOATS,
      ...NUMERIC_INTEGERS,
      ...BIGDECIMAL,
      ...INFINITY,
    ]);
  });

  it("validates numericality with greater than", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThan: 10 });

    await assertInvalidValues([-10, 10], "must be greater than 10");
    await assertValidValues([11]);
  });

  it("validates numericality with greater than using differing numeric types", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThan: new BigDecimal("97.18") });

    await assertInvalidValues(
      [-97.18, new BigDecimal("97.18"), new BigDecimal("-97.18")],
      "must be greater than 97.18",
    );
    await assertValidValues([97.19, 98, new BigDecimal("98"), new BigDecimal("97.19")]);
  });

  it("validates numericality with greater than using string value", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThan: 10 });

    await assertInvalidValues(["-10", "9", "9.9", "10"], "must be greater than 10");
    await assertValidValues(["10.1", "11"]);
  });

  it("validates numericality with greater than or equal", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThanOrEqualTo: 10 });

    await assertInvalidValues([-9, 9], "must be greater than or equal to 10");
    await assertValidValues([10]);
  });

  it("validates numericality with greater than or equal using differing numeric types", async () => {
    Topic.validatesNumericalityOf("approved", {
      greaterThanOrEqualTo: new BigDecimal("97.18"),
    });

    await assertInvalidValues(
      [-97.18, 97.17, 97, new BigDecimal("97.17"), new BigDecimal("-97.18")],
      "must be greater than or equal to 97.18",
    );
    await assertValidValues([97.18, 98, new BigDecimal("97.19")]);
  });

  it("validates numericality with greater than or equal using string value", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThanOrEqualTo: 10 });

    await assertInvalidValues(["-10", "9", "9.9"], "must be greater than or equal to 10");
    await assertValidValues(["10", "10.1", "11"]);
  });

  it("validates numericality with equal to", async () => {
    Topic.validatesNumericalityOf("approved", { equalTo: 10 });

    await assertInvalidValues([-10, 11, ...INFINITY], "must be equal to 10");
    await assertValidValues([10]);
  });

  it("validates numericality with equal to using differing numeric types", async () => {
    Topic.validatesNumericalityOf("approved", { equalTo: new BigDecimal("97.18") });

    await assertInvalidValues([-97.18], "must be equal to 97.18");
    await assertValidValues([new BigDecimal("97.18")]);
  });

  it("validates numericality with equal to using string value", async () => {
    Topic.validatesNumericalityOf("approved", { equalTo: 10 });

    await assertInvalidValues(["-10", "9", "9.9", "10.1", "11"], "must be equal to 10");
    await assertValidValues(["10"]);
  });

  it("validates numericality with less than", async () => {
    Topic.validatesNumericalityOf("approved", { lessThan: 10 });

    await assertInvalidValues([10], "must be less than 10");
    await assertValidValues([-9, 9]);
  });

  it("validates numericality with less than using differing numeric types", async () => {
    Topic.validatesNumericalityOf("approved", { lessThan: new BigDecimal("97.18") });

    await assertInvalidValues([97.18, new BigDecimal("97.18")], "must be less than 97.18");
    await assertValidValues([-97.0, 97.0, -97, 97, new BigDecimal("-97"), new BigDecimal("97")]);
  });

  it("validates numericality with less than using string value", async () => {
    Topic.validatesNumericalityOf("approved", { lessThan: 10 });

    await assertInvalidValues(["10", "10.1", "11"], "must be less than 10");
    await assertValidValues(["-10", "9", "9.9"]);
  });

  it("validates numericality with less than or equal to", async () => {
    Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: 10 });

    await assertInvalidValues([11], "must be less than or equal to 10");
    await assertValidValues([-10, 10]);
  });

  it("validates numericality with less than or equal to using differing numeric types", async () => {
    Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: new BigDecimal("97.18") });

    await assertInvalidValues([97.19, 98], "must be less than or equal to 97.18");
    await assertValidValues([-97.18, new BigDecimal("-97.18"), new BigDecimal("97.18")]);
  });

  it("validates numericality with less than or equal using string value", async () => {
    Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: 10 });

    await assertInvalidValues(["10.1", "11"], "must be less than or equal to 10");
    await assertValidValues(["-10", "9", "9.9", "10"]);
  });

  it("validates numericality with odd", async () => {
    Topic.validatesNumericalityOf("approved", { odd: true });

    await assertInvalidValues([-2, 2], "must be odd");
    await assertValidValues([-1, 1]);
  });

  it("validates numericality with even", async () => {
    Topic.validatesNumericalityOf("approved", { even: true });

    await assertInvalidValues([-1, 1], "must be even");
    await assertValidValues([-2, 2]);
  });

  it("validates numericality with greater than less than and even", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThan: 1, lessThan: 4, even: true });

    await assertInvalidValues([1, 3, 4]);
    await assertValidValues([2]);
  });

  it("validates numericality with other than", async () => {
    Topic.validatesNumericalityOf("approved", { otherThan: 0 });

    await assertInvalidValues([0, 0.0]);
    await assertValidValues([-1, 42]);
  });

  it("validates numericality with in", async () => {
    Topic.validatesNumericalityOf("approved", { in: new Range(1, 3) });

    await assertInvalidValues([0, 4]);
    await assertValidValues([1, 2, 3]);
  });

  it("validates numericality with other than using string value", async () => {
    Topic.validatesNumericalityOf("approved", { otherThan: 0 });

    await assertInvalidValues(["0", "0.0"]);
    await assertValidValues(["-1", "1.1", "42"]);
  });

  it("validates numericality with proc", async () => {
    defineMinApproved();
    Topic.validatesNumericalityOf("approved", {
      greaterThanOrEqualTo: (topic: Topic) => (topic as unknown as MinApproved).minApproved(),
    });

    try {
      await assertInvalidValues([3, 4], "must be greater than or equal to 5");
      await assertValidValues([5, 6]);
    } finally {
      removeMinApproved();
    }
  });

  it("validates numericality with lambda", async () => {
    Topic.validatesNumericalityOf("approved", { greaterThanOrEqualTo: () => 5 });

    await assertInvalidValues([3, 4], "must be greater than or equal to 5");
    await assertValidValues([5, 6]);
  });

  it("validates numericality with symbol", async () => {
    defineMaxApproved();
    Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: ":maxApproved" });

    try {
      await assertInvalidValues([6], "must be less than or equal to 5");
      await assertValidValues([4, 5]);
    } finally {
      removeMaxApproved();
    }
  });

  it("validates numericality with numeric message", async () => {
    Topic.validatesNumericalityOf("approved", { lessThan: 4, message: "smaller than %{count}" });
    let topic = new Topic({ title: "numeric test", approved: 10 });

    assertNotPredicate(await topic.isValid(), (valid) => valid);
    expect(topic.errors.messagesFor("approved")).toEqual(["smaller than 4"]);

    Topic.validatesNumericalityOf("approved", { greaterThan: 4, message: "greater than %{count}" });
    topic = new Topic({ title: "numeric test", approved: 1 });

    assertNotPredicate(await topic.isValid(), (valid) => valid);
    expect(topic.errors.messagesFor("approved")).toEqual(["greater than 4"]);
  });

  it("validates numericality of for ruby class", async () => {
    Person.validatesNumericalityOf("karma", { allowNil: false });

    try {
      const p = new Person();
      p.karma = "Pix";
      assertPredicate(await p.isInvalid(), (invalid) => invalid);

      expect(p.errors.messagesFor("karma")).toEqual(["is not a number"]);

      p.karma = "1234";
      assertPredicate(await p.isValid(), (valid) => valid);
    } finally {
      Person.clearValidatorsBang();
    }
  });

  it("validates numericality using value before type cast if possible", async () => {
    Topic.validatesNumericalityOf("price");

    const topic = new Topic({ price: 50 });

    expect(topic.price).toEqual("$50.00");
    expect((topic as unknown as { priceBeforeTypeCast: unknown }).priceBeforeTypeCast).toEqual(50);
    assertPredicate(await topic.isValid(), (valid) => valid);
  });

  // PERMANENT-SKIP: the assertion needs exact integer arithmetic past 2^53.
  // Ruby's `"10000000000000001".to_i` is an arbitrary-precision Integer that
  // compares greater than 10_000_000_000_000_000; every JS number is a double,
  // so both sides round to the same 1e16 and the value is (correctly, for a
  // double) less-than-or-equal. Only a BigInt-typed parse pipeline through
  // Comparability could express this, which no other option needs.
  it.skip("validates numericality with exponent number", async () => {
    const base = 10_000_000_000_000_000;
    Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: base });
    const topic = new Topic();
    topic.approved = String(base + 1);

    assertPredicate(await topic.isInvalid(), (invalid) => invalid);
  });

  it("validates numericality with object acting as numeric", async () => {
    Topic.validatesNumericalityOf("price");
    const topic = new Topic({ price: new ActingAsNumeric() });

    assertPredicate(await topic.isValid(), (valid) => valid);
  });

  it("validates numericality with invalid args", () => {
    expect(() =>
      Topic.validatesNumericalityOf("approved", { greaterThanOrEqualTo: "foo" }),
    ).toThrow(ArgumentError);
    expect(() => Topic.validatesNumericalityOf("approved", { lessThanOrEqualTo: "foo" })).toThrow(
      ArgumentError,
    );
    expect(() => Topic.validatesNumericalityOf("approved", { greaterThan: "foo" })).toThrow(
      ArgumentError,
    );
    expect(() => Topic.validatesNumericalityOf("approved", { lessThan: "foo" })).toThrow(
      ArgumentError,
    );
    expect(() => Topic.validatesNumericalityOf("approved", { equalTo: "foo" })).toThrow(
      ArgumentError,
    );
    expect(() => Topic.validatesNumericalityOf("approved", { in: "foo" })).toThrow(ArgumentError);
  });

  it("validates numericality equality for float and big decimal", async () => {
    Topic.validatesNumericalityOf("approved", { equalTo: new BigDecimal("65.6") });

    await assertInvalidValues([Number("65.5"), new BigDecimal("65.7")], "must be equal to 65.6");
    await assertValidValues([Number("65.6"), new BigDecimal("65.6")]);
  });

  async function assertInvalidValues(values: unknown[], error?: string): Promise<void> {
    await withEachTopicApprovedValue(values, async (topic, value) => {
      assertPredicate(
        await topic.isInvalid(),
        (invalid) => invalid,
        `${value} not rejected as a number`,
      );
      assertPredicate(
        topic.errors.messagesFor("approved"),
        (errors) => errors.length > 0,
        `FAILED for ${value}`,
      );
      if (error) expect(topic.errors.messagesFor("approved")[0]).toEqual(error);
    });
  }

  async function assertValidValues(values: unknown[]): Promise<void> {
    await withEachTopicApprovedValue(values, async (topic, value) => {
      assertPredicate(
        await topic.isValid(),
        (valid) => valid,
        `${value} not accepted as a number with validation error: ${topic.errors.messagesFor("approved")[0]}`,
      );
    });
  }

  async function withEachTopicApprovedValue(
    values: unknown[],
    block: (topic: Topic, value: unknown) => Promise<void>,
  ): Promise<void> {
    const topic = new Topic({ title: "numeric test", content: "whatever" });
    for (const value of values) {
      topic.approved = value;
      await block(topic, value);
    }
  }
});

interface AllowOnlyIntegers {
  isAllowOnlyIntegers(): boolean;
}

interface MinApproved {
  minApproved(): number;
}

interface MaxApproved {
  maxApproved(): number;
}

/** Rails' `Topic.define_method(:allow_only_integers?) { false }`. */
function defineIsAllowOnlyIntegers(): void {
  (Topic.prototype as unknown as AllowOnlyIntegers).isAllowOnlyIntegers = () => false;
}

/** Rails' `Topic.define_method(:min_approved) { 5 }`. */
function defineMinApproved(): void {
  (Topic.prototype as unknown as MinApproved).minApproved = () => 5;
}

/** Rails' `ensure Topic.remove_method :min_approved`. */
function removeMinApproved(): void {
  delete (Topic.prototype as unknown as Partial<MinApproved>).minApproved;
}

/** Rails' `Topic.define_method(:max_approved) { 5 }`. */
function defineMaxApproved(): void {
  (Topic.prototype as unknown as MaxApproved).maxApproved = () => 5;
}

/** Rails' `ensure Topic.remove_method :max_approved`. */
function removeMaxApproved(): void {
  delete (Topic.prototype as unknown as Partial<MaxApproved>).maxApproved;
}
