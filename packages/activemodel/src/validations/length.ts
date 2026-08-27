import { ArgumentError } from "../attribute-assignment.js";
import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import { camelize, except, Range } from "@blazetrails/activesupport";
import { resolveValue } from "./resolve-value.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

type CheckKey = "is" | "minimum" | "maximum";

/** @internal */
const MESSAGES: Record<CheckKey, string> = {
  is: ":wrong_length",
  minimum: ":too_short",
  maximum: ":too_long",
};

/** @internal */
const CHECKS: Record<CheckKey, (valueLength: number, checkValue: number) => boolean> = {
  is: (valueLength, checkValue) => valueLength === checkValue,
  minimum: (valueLength, checkValue) => valueLength >= checkValue,
  maximum: (valueLength, checkValue) => valueLength <= checkValue,
};

/** @internal */
export const RESERVED_OPTIONS = [
  "minimum",
  "maximum",
  "within",
  "is",
  "tooShort",
  "tooLong",
] as const;

export class LengthValidator extends EachValidator {
  declare resolveValue: typeof resolveValue;
  /** @internal */
  declare skipNilCheck: typeof skipNilCheck;

  constructor(options: Record<string, unknown>) {
    options = { ...options };

    const inOption = options["in"];
    const withinOption = options["within"];
    delete options["in"];
    delete options["within"];
    const range = inOption != null && inOption !== false ? inOption : withinOption;
    if (range != null && range !== false) {
      if (!(range instanceof Range)) {
        throw new ArgumentError(":in and :within must be a Range");
      }
      const r = range as Range<number>;
      if (r.begin !== null) options["minimum"] = r.min();
      if (r.end !== null) {
        options["maximum"] = r.excludeEnd ? r.end - 1 : r.end;
      }
    }

    if (
      options["allowBlank"] === false &&
      options["minimum"] === undefined &&
      options["is"] === undefined
    ) {
      options["minimum"] = 1;
    }

    super(options);
  }

  override checkValidityBang(): void {
    const optionKeys = new Set(
      Object.keys(this.options).filter((key) => this.options[key] !== undefined),
    );
    const keys = (Object.keys(CHECKS) as CheckKey[]).filter((key) => optionKeys.has(key));

    if (keys.length === 0) {
      throw new ArgumentError(
        "Range unspecified. Specify the :in, :within, :maximum, :minimum, or :is option.",
      );
    }

    for (const key of keys) {
      const value = this.options[key];
      if (
        (Number.isInteger(value as number) && (value as number) >= 0) ||
        value === Infinity ||
        value === -Infinity ||
        (typeof value === "string" && value.startsWith(":")) ||
        typeof value === "function"
      ) {
        continue;
      }
      throw new ArgumentError(`:${key} must be a non-negative Integer, Infinity, Symbol, or Proc`);
    }
  }

  validateEach(record: ValidatableRecord, attribute: string, value: unknown): void {
    let valueLength: number;
    if (typeof value === "string" || Array.isArray(value)) {
      valueLength = value.length;
    } else if (
      typeof value === "object" &&
      value !== null &&
      "length" in value &&
      typeof (value as { length: unknown }).length === "number"
    ) {
      valueLength = (value as { length: number }).length;
    } else if (value == null) {
      valueLength = 0;
    } else {
      valueLength = String(value).length;
    }

    const errorsOptions = except(this.options, ...RESERVED_OPTIONS);

    for (const [key, validityCheck] of Object.entries(CHECKS) as Array<
      [CheckKey, (valueLength: number, checkValue: number) => boolean]
    >) {
      let checkValue = this.options[key];
      if (checkValue == null) continue;

      if (value != null || this.skipNilCheck(key)) {
        checkValue = this.resolveValue(record, checkValue);
        if (validityCheck(valueLength, checkValue as number)) continue;
      }

      errorsOptions["count"] = checkValue;

      const defaultMessage = this.options[camelize(MESSAGES[key].slice(1), false)];
      if (defaultMessage != null && errorsOptions["message"] == null) {
        errorsOptions["message"] = defaultMessage;
      }

      record.errors.add(attribute, MESSAGES[key], { ...errorsOptions });
    }
  }
}

/** @internal */
export function skipNilCheck(
  this: { options: Record<string, unknown> },
  key: "minimum" | "maximum" | "is",
): boolean {
  return (
    key === "maximum" &&
    this.options.allowNil === undefined &&
    this.options.allowBlank === undefined
  );
}

LengthValidator.prototype.resolveValue = resolveValue;
LengthValidator.prototype.skipNilCheck = skipNilCheck;

export const HelperMethods = {
  validatesLengthOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
  },

  validatesSizeOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(LengthValidator, this._mergeAttributes(attrNames));
  },
};
