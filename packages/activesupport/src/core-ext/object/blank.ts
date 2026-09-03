import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "../../time-with-zone.js";

const BLANK_RE = /^\s*$/;

function isAsyncFunction(fn: object): boolean {
  return Object.prototype.toString.call(fn) === "[object AsyncFunction]";
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

type TimeValue =
  | Date
  | TimeWithZone
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDate
  | Temporal.PlainDateTime
  | Temporal.PlainTime;

export class NilClass {
  static isBlank(_value: null | undefined): true {
    return true;
  }
  static isPresent(_value: null | undefined): false {
    return false;
  }
}

export class FalseClass {
  static isBlank(_value: false): true {
    return true;
  }
  static isPresent(_value: false): false {
    return false;
  }
}

export class TrueClass {
  static isBlank(_value: true): false {
    return false;
  }
  static isPresent(_value: true): true {
    return true;
  }
}

export class Symbol {
  static isBlank(value: string | symbol): boolean {
    const str = typeof value === "symbol" ? (value.description ?? "") : value;
    return str.length === 0;
  }
  static isPresent(value: string | symbol): boolean {
    return !Symbol.isBlank(value);
  }
}

export class String {
  static readonly BLANK_RE = BLANK_RE;

  static isBlank(value: string): boolean {
    return value.length === 0 || BLANK_RE.test(value);
  }
  static isPresent(value: string): boolean {
    return !String.isBlank(value);
  }
}

export class Time {
  static isBlank(_value: TimeValue): false {
    return false;
  }
  static isPresent(_value: TimeValue): true {
    return true;
  }
}

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return NilClass.isBlank(value);
  if (typeof value === "boolean")
    return value ? TrueClass.isBlank(value) : FalseClass.isBlank(value);
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "symbol") return Symbol.isBlank(value);
  if (typeof value === "string") return String.isBlank(value);
  if (typeof value === "number" || typeof value === "bigint") return false;
  // boundary: a JS `Date` is one of the `TimeValue`s this arm answers for.
  if (
    value instanceof Date ||
    value instanceof TimeWithZone ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainTime
  )
    return Time.isBlank(value);
  if (value instanceof Set || value instanceof Map) return value.size === 0;
  const blank = (value as { isBlank?: unknown }).isBlank;
  if (typeof blank === "function" && !isAsyncFunction(blank)) {
    const result: unknown = (blank as () => unknown).call(value);
    return result != null && result !== false;
  }
  const empty = (value as { isEmpty?: unknown }).isEmpty ?? (value as { empty?: unknown }).empty;
  if (typeof empty === "boolean") return empty;
  if (typeof empty === "function" && !isAsyncFunction(empty)) {
    const result: unknown = (empty as () => unknown).call(value);
    return result != null && result !== false;
  }
  if (typeof value === "object" && isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

export function isPresent(value: unknown): boolean {
  return !isBlank(value);
}

export function presence<T>(value: T): T | undefined {
  return isPresent(value) ? value : undefined;
}
