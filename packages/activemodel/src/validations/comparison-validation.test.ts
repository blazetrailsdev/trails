import { describe, it, expect, afterEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import {
  instant,
  plainDate,
  plainDateTime,
} from "@blazetrails/activesupport/testing/temporal-helpers";
import { Model } from "../index.js";
import { ArgumentError } from "../attribute-assignment.js";

// Mirrors: activemodel/test/models/topic.rb — the subset this file exercises.
// Rails' Topic declares `attr_accessor :approved` with no type, which is the
// untyped ValueType here (type/registry.ts:47).
class Topic extends Model {
  static {
    this.attribute("title", "string");
    this.attribute("content", "string");
    this.attribute("approved", "value");
  }
}

/**
 * Mirrors the `Struct.new(:amount) { include Comparable; def <=> ... }` of
 * `test_validates_comparison_with_custom_compare`. `compareTo` is trails'
 * spelling of Ruby's `<=>` (date/src/date.ts:5147).
 */
class Custom {
  constructor(readonly amount: number) {}

  compareTo(other: Custom): number {
    return (this.amount % 100) - (other.amount % 100);
  }
}

describe("ComparisonValidationTest", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("validates comparison with greater than using numeric", async () => {
    Topic.validatesComparisonOf("approved", { greaterThan: 10 });

    await assertInvalidValues([-12, 10], "must be greater than 10");
    await assertValidValues([11]);
  });

  it("validates comparison with greater than using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { greaterThan: dateValue });

    await assertInvalidValues(
      [
        plainDate("2019-08-03"),
        plainDate("2020-07-03"),
        plainDate("2020-08-01"),
        plainDate("2020-08-02"),
        plainDateTime("2020-08-01T12:34:00"),
      ],
      "must be greater than 2020-08-02",
    );
    await assertValidValues([plainDate("2020-08-03"), plainDateTime("2020-08-02T12:34:00")]);
  });

  it("validates comparison with greater than using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { greaterThan: timeValue });

    await assertInvalidValues(
      [instant("2020-08-01T12:34:00Z"), instant("2020-07-02T18:30:00Z")],
      `must be greater than ${timeValue}`,
    );
    await assertValidValues([instant("2020-08-02T12:34:00Z"), instant("2020-08-02T18:30:00Z")]);
  });

  it("validates comparison with greater than using string", async () => {
    Topic.validatesComparisonOf("approved", { greaterThan: "cat" });

    await assertInvalidValues(["ant", "cat"], "must be greater than cat");
    await assertValidValues(["dog", "whale"]);
  });

  it("validates comparison with greater than or equal to using numeric", async () => {
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: 10 });

    await assertInvalidValues([-12, 5], "must be greater than or equal to 10");
    await assertValidValues([11, 10]);
  });

  it("validates comparison with greater than or equal to using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: dateValue });

    await assertInvalidValues(
      [
        plainDate("2019-08-03"),
        plainDate("2020-07-03"),
        plainDate("2020-08-01"),
        plainDateTime("2020-08-01T12:34:00"),
      ],
      "must be greater than or equal to 2020-08-02",
    );
    await assertValidValues([
      plainDate("2020-08-03"),
      plainDateTime("2020-08-02T12:34:00"),
      plainDate("2020-08-02"),
    ]);
  });

  it("validates comparison with greater than or equal to using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: timeValue });

    await assertInvalidValues(
      [instant("2019-08-01T12:34:00Z"), instant("2020-08-01T12:33:50Z")],
      `must be greater than or equal to ${timeValue}`,
    );
    await assertValidValues([instant("2020-08-01T12:34:00Z"), instant("2020-08-01T12:34:01Z")]);
  });

  it("validates comparison with greater than or equal to using string", async () => {
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: "cat" });

    await assertInvalidValues(["ant"], "must be greater than or equal to cat");
    await assertValidValues(["cat", "dog", "whale"]);
  });

  it("validates comparison with equal to using numeric", async () => {
    Topic.validatesComparisonOf("approved", { equalTo: 10 });

    await assertInvalidValues([-12, 5, 11], "must be equal to 10");
    await assertValidValues([10]);
  });

  it("validates comparison with equal to using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { equalTo: dateValue });

    await assertInvalidValues(
      [
        plainDate("2019-08-03"),
        plainDate("2020-07-03"),
        plainDate("2020-08-01"),
        plainDateTime("2020-08-01T12:34:00"),
        plainDate("2020-08-03"),
        plainDateTime("2020-08-02T12:34:00"),
      ],
      "must be equal to 2020-08-02",
    );
    await assertValidValues([plainDate("2020-08-02"), plainDateTime("2020-08-02T00:00:00")]);
  });

  it("validates comparison with equal to using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { equalTo: timeValue });

    await assertInvalidValues(
      [instant("2019-08-01T12:34:00Z"), instant("2020-08-01T12:33:50Z")],
      `must be equal to ${timeValue}`,
    );
    await assertValidValues([instant("2020-08-01T12:34:00Z")]);
  });

  it("validates comparison with equal to using string", async () => {
    Topic.validatesComparisonOf("approved", { equalTo: "cat" });

    await assertInvalidValues(["dog", "whale"], "must be equal to cat");
    await assertValidValues(["cat"]);
  });

  it("validates comparison with less than using numeric", async () => {
    Topic.validatesComparisonOf("approved", { lessThan: 10 });

    await assertInvalidValues([11, 10], "must be less than 10");
    await assertValidValues([-12, -5, 5]);
  });

  it("validates comparison with less than using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { lessThan: dateValue });

    await assertInvalidValues(
      [plainDate("2020-08-02"), plainDate("2020-08-03"), plainDateTime("2020-08-02T12:34:00")],
      "must be less than 2020-08-02",
    );
    await assertValidValues([
      plainDate("2019-08-03"),
      plainDate("2020-07-03"),
      plainDate("2020-08-01"),
      plainDateTime("2020-08-01T12:34:00"),
    ]);
  });

  it("validates comparison with less than using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { lessThan: timeValue });

    await assertInvalidValues(
      [instant("2020-08-02T12:34:00Z"), instant("2020-08-02T18:30:00Z")],
      `must be less than ${timeValue}`,
    );
    await assertValidValues([instant("2020-08-01T12:33:59Z"), instant("2020-07-02T18:30:00Z")]);
  });

  it("validates comparison with less than using string", async () => {
    Topic.validatesComparisonOf("approved", { lessThan: "dog" });

    await assertInvalidValues(["whale"], "must be less than dog");
    await assertValidValues(["ant", "cat"]);
  });

  it("validates comparison with less than or equal to using numeric", async () => {
    Topic.validatesComparisonOf("approved", { lessThanOrEqualTo: 10 });

    await assertInvalidValues([12], "must be less than or equal to 10");
    await assertValidValues([-11, 5, 10]);
  });

  it("validates comparison with less than or equal to using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { lessThanOrEqualTo: dateValue });

    await assertInvalidValues(
      [plainDate("2020-08-03"), plainDateTime("2020-08-02T12:34:00")],
      "must be less than or equal to 2020-08-02",
    );
    await assertValidValues([
      plainDate("2019-08-03"),
      plainDate("2020-07-03"),
      plainDate("2020-08-01"),
      plainDate("2020-08-02"),
      plainDateTime("2020-08-01T12:34:00"),
    ]);
  });

  it("validates comparison with less than or equal to using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { lessThanOrEqualTo: timeValue });

    await assertInvalidValues(
      [instant("2020-09-01T12:34:00Z"), instant("2020-08-01T12:34:01Z")],
      `must be less than or equal to ${timeValue}`,
    );
    await assertValidValues([instant("2020-08-01T12:34:00Z"), instant("2020-08-01T12:33:50Z")]);
  });

  it("validates comparison with less than or equal to using string", async () => {
    Topic.validatesComparisonOf("approved", { lessThanOrEqualTo: "dog" });

    await assertInvalidValues(["whale"], "must be less than or equal to dog");
    await assertValidValues(["ant", "cat", "dog"]);
  });

  it("validates comparison with other than using numeric", async () => {
    Topic.validatesComparisonOf("approved", { otherThan: 10 });

    await assertInvalidValues([10], "must be other than 10");
    await assertValidValues([-12, 5, 11]);
  });

  it("validates comparison with other than using date", async () => {
    const dateValue = plainDate("2020-08-02");
    Topic.validatesComparisonOf("approved", { otherThan: dateValue });

    await assertInvalidValues(
      [plainDate("2020-08-02"), plainDateTime("2020-08-02T00:00:00")],
      "must be other than 2020-08-02",
    );
    await assertValidValues([
      plainDate("2019-08-03"),
      plainDate("2020-07-03"),
      plainDate("2020-08-01"),
      plainDateTime("2020-08-01T12:34:00"),
      plainDate("2020-08-03"),
      plainDateTime("2020-08-02T12:34:00"),
    ]);
  });

  it("validates comparison with other than using time", async () => {
    const timeValue = instant("2020-08-01T12:34:00Z");
    Topic.validatesComparisonOf("approved", { otherThan: timeValue });

    await assertInvalidValues([instant("2020-08-01T12:34:00Z")], `must be other than ${timeValue}`);
    await assertValidValues([instant("2019-08-01T12:34:00Z"), instant("2020-08-01T12:33:50Z")]);
  });

  it("validates comparison with other than using string", async () => {
    Topic.validatesComparisonOf("approved", { otherThan: "whale" });

    await assertInvalidValues(["whale"], "must be other than whale");
    await assertValidValues(["ant", "cat", "dog"]);
  });

  it("validates comparison with proc", async () => {
    defineRequested();
    Topic.validatesComparisonOf("approved", {
      greaterThanOrEqualTo: (topic: Topic) => (topic as unknown as Requested).requested(),
    });

    try {
      await assertInvalidValues(
        [plainDate("2020-07-01"), plainDate("2019-07-01"), plainDateTime("2020-07-01T22:34:00")],
        "must be greater than or equal to 2020-08-01",
      );
      await assertValidValues([plainDate("2020-08-02"), plainDateTime("2021-08-01T00:00:00")]);
    } finally {
      removeRequested();
    }
  });

  it("validates comparison with lambda", async () => {
    Topic.validatesComparisonOf("approved", {
      greaterThanOrEqualTo: () => plainDate("2020-08-01"),
    });

    await assertInvalidValues(
      [plainDate("2020-07-01"), plainDate("2019-07-01"), plainDateTime("2020-07-01T22:34:00")],
      "must be greater than or equal to 2020-08-01",
    );
    await assertValidValues([plainDate("2020-08-02"), plainDateTime("2021-08-01T00:00:00")]);
  });

  it("validates comparison with method", async () => {
    defineRequested();
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: ":requested" });

    try {
      await assertInvalidValues(
        [plainDate("2020-07-01"), plainDate("2019-07-01"), plainDateTime("2020-07-01T22:34:00")],
        "must be greater than or equal to 2020-08-01",
      );
      await assertValidValues([plainDate("2020-08-02"), plainDateTime("2021-08-01T00:00:00")]);
    } finally {
      removeRequested();
    }
  });

  it("validates comparison with custom compare", async () => {
    Topic.validatesComparisonOf("approved", { greaterThanOrEqualTo: new Custom(1150) });

    await assertInvalidValues([new Custom(530), new Custom(2325)]);
    await assertValidValues([new Custom(575), new Custom(250), new Custom(1999)]);
  });

  it("validates comparison with blank allowed", async () => {
    Topic.validatesComparisonOf("approved", { greaterThan: "cat", allowBlank: true });

    await assertInvalidValues(["ant"]);
    await assertValidValues([null, ""]);
  });

  it("validates comparison with nil allowed", async () => {
    Topic.validatesComparisonOf("approved", { lessThan: 100, allowNil: true });

    await assertInvalidValues([200]);
    await assertValidValues([null, 50]);
  });

  it("validates comparison of incomparables", async () => {
    Topic.validatesComparisonOf("approved", { lessThan: "cat" });

    await assertInvalidValues([12], "comparison of Integer with String failed");
    await assertInvalidValues([null]);
    await assertValidValues([]);
  });

  it("validates comparison of multiple values", async () => {
    Topic.validatesComparisonOf("approved", { otherThan: 17, greaterThan: 13 });

    await assertInvalidValues([12, null, 17]);
    await assertValidValues([15]);
  });

  it("validates comparison of no options", () => {
    let error: Error | undefined;
    expect(() => {
      try {
        Topic.validatesComparisonOf("approved");
      } catch (e) {
        error = e as Error;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(error?.message).toEqual(
      "Expected one of :greater_than, :greater_than_or_equal_to," +
        " :equal_to, :less_than, :less_than_or_equal_to, or :other_than option to be supplied.",
    );
  });

  async function assertInvalidValues(values: unknown[], error?: string): Promise<void> {
    await withEachTopicApprovedValue(values, async (topic, value) => {
      assertPredicate(await topic.isInvalid(), (invalid) => invalid, `${value} failed comparison`);
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
        `${value} failed comparison with validation error: ${topic.errors.messagesFor("approved")[0]}`,
      );
    });
  }

  async function withEachTopicApprovedValue(
    values: unknown[],
    block: (topic: Topic, value: unknown) => Promise<void>,
  ): Promise<void> {
    const topic = new Topic({ title: "comparison test", content: "whatever" });
    for (const value of values) {
      topic.approved = value;
      await block(topic, value);
    }
  }
});

interface Requested {
  requested(): unknown;
}

/** Rails' `Topic.define_method(:requested) { Date.new(2020, 8, 1) }`. */
function defineRequested(): void {
  (Topic.prototype as unknown as Requested).requested = () => plainDate("2020-08-01");
}

/** Rails' `ensure Topic.remove_method :requested`. */
function removeRequested(): void {
  delete (Topic.prototype as unknown as Partial<Requested>).requested;
}
