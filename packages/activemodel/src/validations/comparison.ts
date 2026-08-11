import { Temporal } from "@blazetrails/date";
import { ArgumentError } from "../attribute-assignment.js";
import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { isBlank, underscore } from "@blazetrails/activesupport";
import { COMPARE_CHECKS, compareOperator, errorOptions } from "./comparability.js";
import type { CompareKey } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";

export class ComparisonValidator extends EachValidator {
  resolveValue = resolveValue;
  errorOptions = errorOptions;

  validateEach(record: ValidatableRecord, attrName: string, value: unknown): void {
    for (const option of Object.keys(COMPARE_CHECKS) as CompareKey[]) {
      const rawOptionValue = this.options[option];
      if (rawOptionValue === undefined) continue;
      const optionValue = this.resolveValue(record, rawOptionValue);

      if (value === null || value === undefined || (typeof value === "string" && isBlank(value))) {
        record.errors.add(attrName, ":blank", this.errorOptions(value, optionValue));
        return;
      }

      try {
        const cmp = this.compare(value, optionValue);
        if (!compareOperator(COMPARE_CHECKS[option], cmp, 0)) {
          record.errors.add(
            attrName,
            `:${underscore(option)}`,
            this.errorOptions(value, optionValue),
          );
        }
      } catch (e) {
        if (!(e instanceof ArgumentError)) throw e;
        // Rails comparison.rb:30 — uses the ArgumentError message as the
        // error key/message and continues to the next compare option.
        record.errors.add(attrName, e.message);
      }
    }
  }

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
    // boundary: comparison validator accepts Date pairs by Rails parity.
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    // Match Rails ArgumentError format from value.public_send(op, other):
    //   "comparison of Integer with String failed"
    const nameOf = (x: unknown) =>
      x === null
        ? "NilClass"
        : x === undefined
          ? "NilClass"
          : ((x as object).constructor?.name ?? typeof x);
    throw new ArgumentError(`comparison of ${nameOf(a)} with ${nameOf(b)} failed`);
  }

  override checkValidity(): void {
    if (!Object.keys(COMPARE_CHECKS).some((k) => this.options[k] !== undefined)) {
      throw new ArgumentError(
        "One of :greater_than, :greater_than_or_equal_to, :less_than, :less_than_or_equal_to, :equal_to, or :other_than must be supplied",
      );
    }
  }
}
