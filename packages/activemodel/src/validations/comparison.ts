import { Temporal } from "@blazetrails/activesupport/temporal";
import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";
import { isBlank } from "@blazetrails/activesupport";
import { COMPARE_CHECKS, errorOptions } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";

type CompareKey = (typeof COMPARE_CHECKS)[number];

const COMPARE_OPS = {
  greaterThan: (c) => c > 0,
  greaterThanOrEqualTo: (c) => c >= 0,
  equalTo: (c) => c === 0,
  lessThan: (c) => c < 0,
  lessThanOrEqualTo: (c) => c <= 0,
  otherThan: (c) => c !== 0,
} satisfies Record<CompareKey, (cmp: number) => boolean>;

const COMPARE_KEYS_TO_RAILS = {
  greaterThan: "greater_than",
  greaterThanOrEqualTo: "greater_than_or_equal_to",
  equalTo: "equal_to",
  lessThan: "less_than",
  lessThanOrEqualTo: "less_than_or_equal_to",
  otherThan: "other_than",
} satisfies Record<CompareKey, string>;

export class ComparisonValidator extends EachValidator {
  resolveValue = resolveValue;
  errorOptions = errorOptions;

  private compare(a: unknown, b: unknown): number {
    if (a instanceof Temporal.Instant && b instanceof Temporal.Instant)
      return Temporal.Instant.compare(a, b);
    if (a instanceof Temporal.PlainDateTime && b instanceof Temporal.PlainDateTime)
      return Temporal.PlainDateTime.compare(a, b);
    if (a instanceof Temporal.PlainDate && b instanceof Temporal.PlainDate)
      return Temporal.PlainDate.compare(a, b);
    if (a instanceof Temporal.PlainTime && b instanceof Temporal.PlainTime)
      return Temporal.PlainTime.compare(a, b);
    if (a instanceof Temporal.ZonedDateTime && b instanceof Temporal.ZonedDateTime)
      return Temporal.ZonedDateTime.compare(a, b);
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    // Match Rails ArgumentError format from value.public_send(op, other):
    //   "comparison of Integer with String failed"
    const nameOf = (x: unknown) =>
      x === null
        ? "NilClass"
        : x === undefined
          ? "NilClass"
          : ((x as object).constructor?.name ?? typeof x);
    throw new TypeError(`comparison of ${nameOf(a)} with ${nameOf(b)} failed`);
  }

  override checkValidity(): void {
    if (!COMPARE_CHECKS.some((k) => (this.options as Record<string, unknown>)[k] !== undefined)) {
      throw new Error(
        "One of :greater_than, :greater_than_or_equal_to, :less_than, :less_than_or_equal_to, :equal_to, or :other_than must be supplied",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    for (const optKey of COMPARE_CHECKS) {
      const raw = (this.options as Record<string, unknown>)[optKey];
      if (raw === undefined) continue;
      const optionValue = this.resolveValue(record, raw);

      if (value === null || value === undefined || (typeof value === "string" && isBlank(value))) {
        record.errors.add(attribute, "blank", this.errorOptions(value, optionValue));
        return;
      }

      try {
        const cmp = this.compare(value, optionValue);
        if (!COMPARE_OPS[optKey](cmp)) {
          record.errors.add(
            attribute,
            COMPARE_KEYS_TO_RAILS[optKey],
            this.errorOptions(value, optionValue),
          );
        }
      } catch (e) {
        // Rails comparison.rb:30 — uses the ArgumentError message as the
        // error key/message and continues to the next compare option.
        record.errors.add(attribute, (e as Error).message);
      }
    }
  }
}
