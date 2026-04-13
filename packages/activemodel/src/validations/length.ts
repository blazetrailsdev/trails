import { EachValidator } from "../validator.js";
import type { AnyRecord } from "../validator.js";

export class LengthValidator extends EachValidator {
  override checkValidity(): void {
    if (
      this.options.minimum === undefined &&
      this.options.maximum === undefined &&
      this.options.is === undefined &&
      this.options.in === undefined
    ) {
      throw new Error(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }
  }

  validateEach(record: AnyRecord, attribute: string, value: unknown): void {
    if (value === null || value === undefined) {
      const maximumOnly =
        this.options.maximum !== undefined &&
        this.options.minimum === undefined &&
        this.options.is === undefined &&
        this.options.in === undefined;
      if (this.options.allowNil !== false || maximumOnly) return;
    }

    let length: number;
    if (typeof value === "string" || Array.isArray(value)) {
      length = value.length;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "length" in value &&
      typeof (value as { length: unknown }).length === "number"
    ) {
      length = (value as { length: number }).length;
    } else {
      length = 0;
    }

    const resolveNum = (v: number | (() => number) | undefined): number | undefined => {
      if (v === undefined) return undefined;
      return typeof v === "function" ? v() : v;
    };
    const inOpt = this.options.in as [number, number] | undefined;
    let min = inOpt
      ? inOpt[0]
      : resolveNum(this.options.minimum as number | (() => number) | undefined);
    const max = inOpt
      ? inOpt[1]
      : resolveNum(this.options.maximum as number | (() => number) | undefined);

    if (
      min === undefined &&
      max === undefined &&
      this.options.allowBlank === false &&
      this.options.is === undefined &&
      inOpt === undefined
    ) {
      min = 1;
    }

    if (min !== undefined && length < min) {
      record.errors.add(attribute, "too_short", {
        message: (this.options.tooShort ?? this.options.message) as string | undefined,
        count: min,
        value,
      });
    }
    if (max !== undefined && length > max) {
      record.errors.add(attribute, "too_long", {
        message: (this.options.tooLong ?? this.options.message) as string | undefined,
        count: max,
        value,
      });
    }
    if (this.options.is !== undefined && length !== this.options.is) {
      record.errors.add(attribute, "wrong_length", {
        message: (this.options.wrongLength ?? this.options.message) as string | undefined,
        count: this.options.is,
        value,
      });
    }
  }
}
