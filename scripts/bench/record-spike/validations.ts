import type { Base } from "./base.js";
import { quoteColumnName } from "./connection-handling.js";
import { serialize } from "./type.js";

/** One failed validation: plain data, with no message text until it is asked for. */
export interface ValidationError {
  readonly attribute: string;
  readonly type: string;
  readonly options: Readonly<Record<string, unknown>>;
}

/** Checks one value and answers what is wrong with it, or nothing. */
export type Check = (value: unknown, record: Base, attribute: string) => ValidationError[];

export interface Validator {
  readonly attribute: string;
  readonly allowNil: boolean;
  readonly allowBlank: boolean;
  readonly check: Check;
}

export interface NumericalityOptions {
  onlyInteger?: boolean;
  greaterThan?: number;
  greaterThanOrEqualTo?: number;
  equalTo?: number;
  lessThan?: number;
  lessThanOrEqualTo?: number;
  otherThan?: number;
}

export interface ValidatesOptions {
  presence?: boolean;
  length?: { minimum?: number; maximum?: number; is?: number };
  numericality?: boolean | NumericalityOptions;
  inclusion?: { in: readonly unknown[] };
  uniqueness?: boolean;
  allowNil?: boolean;
  allowBlank?: boolean;
}

function error(attribute: string, type: string, options: Record<string, unknown> = {}) {
  return [{ attribute, type, options }];
}

const RUBY_BLANK = /^[\t\n\v\f\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*$/;
const HEXADECIMAL = /^\s*[+-]?0[xX]/;

export function isBlank(value: unknown): boolean {
  if (value == null || value === false) return true;
  if (typeof value === "string") return RUBY_BLANK.test(value);
  return Array.isArray(value) && value.length === 0;
}

const presence: Check = (value, _record, attribute) =>
  isBlank(value) ? error(attribute, ":blank") : [];

function length({ minimum, maximum, is }: NonNullable<ValidatesOptions["length"]>): Check {
  return (value, _record, attribute) => {
    const size =
      value == null
        ? 0
        : typeof value === "string" || Array.isArray(value)
          ? value.length
          : String(value).length;
    const errors: ValidationError[] = [];
    if (minimum !== undefined && size < minimum) {
      errors.push(...error(attribute, ":too_short", { count: minimum }));
    }
    if (maximum !== undefined && value != null && size > maximum) {
      errors.push(...error(attribute, ":too_long", { count: maximum }));
    }
    if (is !== undefined && size !== is) {
      errors.push(...error(attribute, ":wrong_length", { count: is }));
    }
    return errors;
  };
}

const COMPARISONS: ReadonlyArray<
  [keyof NumericalityOptions, string, (value: number, count: number) => boolean]
> = [
  ["greaterThan", ":greater_than", (value, count) => value > count],
  ["greaterThanOrEqualTo", ":greater_than_or_equal_to", (value, count) => value >= count],
  ["equalTo", ":equal_to", (value, count) => value === count],
  ["lessThan", ":less_than", (value, count) => value < count],
  ["lessThanOrEqualTo", ":less_than_or_equal_to", (value, count) => value <= count],
  ["otherThan", ":other_than", (value, count) => value !== count],
];

function numericality(options: NumericalityOptions): Check {
  const comparisons = COMPARISONS.filter(([key]) => options[key] !== undefined);
  return (_value, record, attribute) => {
    const raw = record.readAttributeBeforeTypeCast(attribute);
    const number =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && !HEXADECIMAL.test(raw) && !isBlank(raw)
          ? Number(raw.replace(/(?<=\d)_(?=\d)/g, ""))
          : NaN;
    if (Number.isNaN(number) || (typeof raw === "string" && !Number.isFinite(number))) {
      return error(attribute, ":not_a_number", { value: raw });
    }
    const integer = typeof raw === "string" ? /^[+-]?\d+$/.test(raw) : Number.isInteger(number);
    if (options.onlyInteger === true && !integer) {
      return error(attribute, ":not_an_integer", { value: raw });
    }
    const errors: ValidationError[] = [];
    for (const [key, type, passes] of comparisons) {
      const count = options[key] as number;
      if (!passes(number, count)) errors.push(...error(attribute, type, { value: raw, count }));
    }
    return errors;
  };
}

function inclusion(members: readonly unknown[]): Check {
  return (value, _record, attribute) =>
    members.includes(value) ? [] : error(attribute, ":inclusion", { value });
}

const uniqueness: Check = (value, record, attribute) => {
  const { klass, quotedTableName, columnIndex, types, primaryKey, primaryKeyIndex } =
    record._schema;
  const column = `${quotedTableName}.${quoteColumnName(attribute)}`;
  const index = columnIndex.get(attribute);
  const binds: unknown[] = [];
  let sql = `SELECT 1 AS one FROM ${quotedTableName} WHERE ${column} `;
  if (value == null) {
    sql += "IS NULL";
  } else {
    sql += "= ?";
    binds.push(index === undefined ? value : serialize(types[index], value));
  }
  if (!record.isNewRecord() && primaryKey !== null) {
    sql += ` AND ${quotedTableName}.${quoteColumnName(primaryKey)} != ?`;
    binds.push((record._original ?? record._row)[primaryKeyIndex]);
  }
  const taken = klass.connection.selectRow(`${sql} LIMIT 1`, binds) !== undefined;
  return taken ? error(attribute, ":taken", { value }) : [];
};

/** Turns one `validates` call into validators, each a closure built once, at declaration. */
export function buildValidators(
  attributes: readonly string[],
  options: ValidatesOptions,
): Validator[] {
  const checks: Check[] = [];
  if (options.presence === true) checks.push(presence);
  if (options.length !== undefined) checks.push(length(options.length));
  if (options.numericality !== undefined && options.numericality !== false) {
    checks.push(numericality(options.numericality === true ? {} : options.numericality));
  }
  if (options.inclusion !== undefined) checks.push(inclusion(options.inclusion.in));
  if (options.uniqueness === true) checks.push(uniqueness);
  const allowNil = options.allowNil === true;
  const allowBlank = options.allowBlank === true;
  return attributes.flatMap((attribute) =>
    checks.map((check) => ({ attribute, allowNil, allowBlank, check })),
  );
}

/** Runs a model's validators against a record and answers every failure, in declaration order. */
export function validate(record: Base, validators: readonly Validator[]): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const { attribute, allowNil, allowBlank, check } of validators) {
    const value = record.readAttribute(attribute);
    if ((allowNil && value == null) || (allowBlank && isBlank(value))) continue;
    const failures = check(value, record, attribute);
    if (failures.length > 0) errors.push(...failures);
  }
  return errors;
}
