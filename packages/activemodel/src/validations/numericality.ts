import { isSymbol } from "@blazetrails/ruby-compat";

import { EachValidator } from "../validator.js";
import type { ValidatableRecord } from "../validator.js";
import {
  underscore,
  BigDecimal,
  Range,
  kernelFloat,
  mergeBang,
  slice,
} from "@blazetrails/activesupport";
import { COMPARE_CHECKS, compareOperator, errorOptions } from "./comparability.js";
import type { CompareKey } from "./comparability.js";
import { resolveValue } from "./resolve-value.js";
import { ArgumentError } from "../attribute-assignment.js";
import type { AttrNameArg, HelperMethodsHost } from "./helper-methods.js";

type NumericValue = number | bigint | ((record: ValidatableRecord) => number) | string;

export class NumericalityValidator extends EachValidator {
  resolveValue = resolveValue;
  errorOptions = errorOptions;

  /** @internal */
  /** @internal */
  declare optionAsNumber: typeof optionAsNumber;
  /** @internal */
  declare parseFloat: typeof parseFloat;
  /** @internal */
  declare round: typeof round;
  /** @internal */
  declare isNumber: typeof isNumber;
  /** @internal */
  declare isInteger: typeof isInteger;
  /** @internal */
  declare isHexadecimalLiteral: typeof isHexadecimalLiteral;
  /** @internal */
  declare filteredOptions: typeof filteredOptions;
  /** @internal */
  declare isAllowOnlyInteger: typeof isAllowOnlyInteger;
  /** @internal */
  declare prepareValueForValidation: typeof prepareValueForValidation;
  /** @internal */
  declare isRecordAttributeChangedInPlace: typeof isRecordAttributeChangedInPlace;

  override checkValidityBang(): void {
    for (const [option, value] of Object.entries(
      slice(this.options, ...Object.keys(COMPARE_CHECKS)),
    )) {
      if (value === undefined) continue;
      if (!isNumeric(value) && typeof value !== "function" && !isSymbol(value)) {
        throw new ArgumentError(`:${underscore(option)} must be a number, a symbol or a proc`);
      }
    }

    for (const [option, value] of Object.entries(
      slice(this.options, ...Object.keys(RANGE_CHECKS)),
    )) {
      if (value === undefined) continue;
      if (!(value instanceof Range)) {
        throw new ArgumentError(`:${option} must be a range`);
      }
    }
  }

  /** @missingRailsArgs merge! — PERMANENT */
  validateEach(
    record: ValidatableRecord,
    attrName: string,
    value: unknown,
    precision = 15,
    scale?: number,
  ): void {
    if (!this.isNumber(value, precision, scale)) {
      record.errors.add(attrName, ":not_a_number", this.filteredOptions(value));
      return;
    }

    if (this.isAllowOnlyInteger(record) && !this.isInteger(value)) {
      record.errors.add(attrName, ":not_an_integer", this.filteredOptions(value));
      return;
    }

    const num = parseAsNumber(value, precision, scale) as number | bigint;
    value = num;

    for (const [option, rawOptionValue] of Object.entries(
      slice(this.options, ...RESERVED_OPTIONS),
    )) {
      let optionValue = rawOptionValue as NumericValue | undefined;
      if (optionValue === undefined) continue;
      if (option in NUMBER_CHECKS) {
        const odd = typeof num === "bigint" ? num % 2n !== 0n : Math.trunc(num) % 2 !== 0;
        if (NUMBER_CHECKS[option as keyof typeof NUMBER_CHECKS] === ":odd?" ? !odd : odd) {
          record.errors.add(attrName, `:${option}`, this.filteredOptions(value));
        }
      } else if (option in RANGE_CHECKS) {
        const range = optionValue as unknown as Range<number>;
        if (!range.isInclude(num as number)) {
          record.errors.add(
            attrName,
            `:${option}`,
            mergeBang(this.filteredOptions(value), { count: range.toS() }),
          );
        }
      } else if (option in COMPARE_CHECKS) {
        optionValue = this.optionAsNumber(record, optionValue, precision, scale);
        if (optionValue === undefined) continue;
        if (!compareOperator(COMPARE_CHECKS[option as CompareKey], num, optionValue)) {
          record.errors.add(
            attrName,
            `:${underscore(option)}`,
            mergeBang(this.filteredOptions(value), { count: optionValue }),
          );
        }
      }
    }
  }
}

const INTEGER_REGEX = /^[+-]?\d+(?![\s\S])/;
const HEXADECIMAL_REGEX = /^[+-]?0[xX]/;

const RANGE_CHECKS = { in: ":in?" } as const;
const NUMBER_CHECKS = { odd: ":odd?", even: ":even?" } as const;

const RESERVED_OPTIONS = [
  ...Object.keys(COMPARE_CHECKS),
  ...Object.keys(NUMBER_CHECKS),
  ...Object.keys(RANGE_CHECKS),
  "onlyInteger",
  "onlyNumeric",
];

/** @internal */
export function optionAsNumber(
  this: {
    resolveValue(record: unknown, value: unknown): unknown;
  },
  record: ValidatableRecord,
  optionValue: unknown,
  precision: number,
  scale?: number,
): number | bigint | undefined {
  return parseAsNumber(this.resolveValue(record, optionValue), precision, scale);
}

/**
 * @internal
 * @missingRailsArgs parse_float — PERMANENT
 */
export function parseAsNumber(
  rawValue: unknown,
  precision: number,
  scale?: number,
): number | bigint | undefined {
  if (typeof rawValue === "number") {
    if (Number.isNaN(rawValue)) return undefined;
    return rawValue % 1 === 0 ? rawValue : parseFloat(rawValue, precision, scale);
  }
  if (rawValue instanceof BigDecimal) return round(Number(rawValue.toString("F")), scale);
  if (isInteger(rawValue)) {
    const int = BigInt(String(rawValue));
    return int >= BigInt(Number.MIN_SAFE_INTEGER) && int <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(int)
      : int;
  }
  if (!isHexadecimalLiteral(rawValue)) {
    const float = kernelFloat(rawValue);
    if (float === undefined) return undefined;
    return parseFloat(float, precision, scale);
  }
  return undefined;
}

function isNumeric(value: unknown): boolean {
  return typeof value === "number" || typeof value === "bigint" || value instanceof BigDecimal;
}

/** @internal */
export function round(rawValue: number, scale?: number): number {
  if (scale === undefined || scale === null) return rawValue;
  if (!Number.isFinite(rawValue)) return rawValue;
  return Number(new BigDecimal(String(rawValue)).round(scale).toString("F"));
}

/** @internal */
export function isNumber(
  this: { options: Record<string, unknown> },
  rawValue: unknown,
  precision: number,
  scale?: number,
): boolean {
  if (this.options.onlyNumeric && !isNumeric(rawValue)) return false;

  return parseAsNumber(rawValue, precision, scale) !== undefined;
}

/** @internal */
export function isInteger(rawValue: unknown): boolean {
  return INTEGER_REGEX.test(String(rawValue));
}

/** @internal */
export function isHexadecimalLiteral(rawValue: unknown): boolean {
  return HEXADECIMAL_REGEX.test(String(rawValue));
}

/** @internal */
export function filteredOptions(
  this: { options: Record<string, unknown> },
  value: unknown,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(this.options)) {
    if (!RESERVED_OPTIONS.includes(key)) {
      filtered[key] = this.options[key];
    }
  }
  filtered.value = value;
  return filtered;
}

/** @internal */
export function isAllowOnlyInteger(
  this: {
    options: Record<string, unknown>;
    resolveValue(record: unknown, value: unknown): unknown;
  },
  record: ValidatableRecord,
): boolean {
  const resolved = this.resolveValue(record, this.options.onlyInteger);
  return resolved !== undefined && resolved !== null && resolved !== false;
}

/** @internal */
export function prepareValueForValidation(
  this: unknown,
  value: unknown,
  record: ValidatableRecord,
  attrName: string,
): unknown {
  const r = record as unknown as RecordWithRawAttribute;
  let rawValue: unknown;
  const cameFromUser = `${attrName}CameFromUser`;
  if (cameFromUser in r) {
    if (r[cameFromUser]) {
      rawValue = r[`${attrName}BeforeTypeCast`];
    } else if (typeof r._readAttribute === "function") {
      rawValue = r._readAttribute(attrName);
    }
  } else {
    const beforeTypeCast = `${attrName}BeforeTypeCast`;
    if (beforeTypeCast in r) {
      rawValue = r[beforeTypeCast];
    }
  }
  return rawValue !== undefined && rawValue !== null && rawValue !== false ? rawValue : value;
}

interface RecordWithRawAttribute {
  attributeChangedInPlace?: (name: string) => boolean;
  _readAttribute?: (name: string) => unknown;
  [key: string]: unknown;
}

/** @internal */
export function isRecordAttributeChangedInPlace(
  record: ValidatableRecord,
  attrName: string,
): boolean {
  const r = record as unknown as RecordWithRawAttribute;
  return typeof r.attributeChangedInPlace === "function" && r.attributeChangedInPlace(attrName);
}

/** @internal */
function parseFloat(num: number, precision: number, scale?: number): number {
  if (!Number.isFinite(num)) return num;
  return Number(new BigDecimal(round(num, scale), precision).toString("F"));
}

NumericalityValidator.prototype.optionAsNumber = optionAsNumber;
NumericalityValidator.prototype.parseFloat = parseFloat;
NumericalityValidator.prototype.round = round;
NumericalityValidator.prototype.isNumber = isNumber;
NumericalityValidator.prototype.isInteger = isInteger;
NumericalityValidator.prototype.isHexadecimalLiteral = isHexadecimalLiteral;
NumericalityValidator.prototype.filteredOptions = filteredOptions;
NumericalityValidator.prototype.isAllowOnlyInteger = isAllowOnlyInteger;
NumericalityValidator.prototype.prepareValueForValidation = prepareValueForValidation;
NumericalityValidator.prototype.isRecordAttributeChangedInPlace = isRecordAttributeChangedInPlace;

export const HelperMethods = {
  validatesNumericalityOf(this: HelperMethodsHost, ...attrNames: AttrNameArg[]): void {
    return this.validatesWith(NumericalityValidator, this._mergeAttributes(attrNames));
  },
};
