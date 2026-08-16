/**
 * Blank extensions — mirrors Rails' core_ext/object/blank.rb
 *
 * In Ruby, these are monkey-patches on built-in classes. In TypeScript,
 * `presence` is a standalone function and the per-class `blank?`/`present?`
 * arms are statics on type-specific classes, one per Ruby reopening.
 *
 * `isBlank` below is `Object#blank?` (blank.rb:18-20) — the entry point Ruby
 * reaches by dynamic dispatch. TypeScript has no per-class dispatch on a
 * built-in, so it switches on the value class in blank.rb's own order and
 * routes to that class's arm. `Array`, `Hash` and `Numeric` have no class here:
 * their arms (`alias_method :blank?, :empty?` at blank.rb:96/111, and
 * blank.rb:167-169) are one expression each, applied inline at the switch.
 */

import { Temporal } from "@blazetrails/date";
import { TimeWithZone } from "../../time-with-zone.js";

const BLANK_RE = /^\s*$/;

function isAsyncFunction(fn: object): boolean {
  return Object.prototype.toString.call(fn) === "[object AsyncFunction]";
}

/**
 * A JS object literal is trails' Ruby `Hash`, and only it reaches blank.rb:111's
 * `alias_method :blank?, :empty?`. A class instance is a plain Ruby object, whose
 * `blank?` is `!self` (blank.rb:18-20) — never an own-key count.
 */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * The values `blank?` reaches Ruby's `Time` arm (blank.rb:182-184) through.
 * Ruby has one `Time` class; trails' Time analogue is Temporal, so the arm is
 * typed on the whole family plus `TimeWithZone` — the same widening
 * `core-ext/object/json.ts` applies to `Time#as_json`. `Temporal.PlainDate` /
 * `PlainDateTime` stand for Ruby's `Date` / `DateTime`, which blank.rb does not
 * reopen; they are `false` in Ruby through `Object#blank?`, which the fallthrough
 * arm below now answers for them anyway.
 */
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

/**
 * `Object#blank?` (`core_ext/object/blank.rb:18-20`) plus the per-class
 * overrides, dispatched on the value class in blank.rb's own order: `NilClass`
 * (:56), `FalseClass` (:69), `TrueClass` (:82), `Array` (:96), `Hash` (:111),
 * `Symbol` (:120), `String` (:145-153), `Numeric` (:167-169), `Time`
 * (:182-184, over the whole {@link TimeValue} family). `Array`, `Hash` and
 * `Numeric` get no class of their own here: their arms are
 * `alias_method :blank?, :empty?` and a bare `false`, applied at the switch.
 *
 * A Ruby Symbol is a JS string, so the `Symbol` arm is reached only by a
 * genuine JS `symbol`; the string spelling falls through to `String`.
 *
 * `Object#blank?`'s `respond_to?(:empty?)` arm answers for `Set` and `Map`,
 * which `Object.keys` reports as empty, and for any other object carrying an
 * `isEmpty` (the conventions-table spelling of `empty?`) or `empty` (the getter
 * actionpack's Hash-like wrappers carry) — as a boolean reader, or as a method
 * invoked the way blank.rb:19 invokes `empty?`.
 *
 * An `async` one is held out: Ruby's `blank?` issues no I/O, and trails has
 * querying `isEmpty`s (`Relation`, `CollectionAssociation`, `Preloader`,
 * `Querying`). They are excluded BEFORE the call, which is the only point at
 * which exclusion is worth anything — invoking to find out would already have
 * issued the query. `Object.prototype.toString` reads the function object's
 * `AsyncFunction` tag, which a bound method keeps (`Function.prototype.bind`
 * copies the target's prototype), where a `Promise<boolean>` return type is
 * erased by the time this runs.
 *
 * The contract that a querying `empty?` is spelled `async` is enforced by the
 * `blazetrails/async-querying-empty` lint rule, so every non-`async` one
 * reaching the probe is synchronous.
 *
 * blank.rb:19 is `!!empty?`, and Ruby's `!!` is false only for `nil`/`false`,
 * so a predicate answering a value rather than a boolean still answers.
 */
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
  // Ruby's `blank?` is a method on the object, so a value that answers it
  // itself wins over the generic `empty?` probe below. This is how a class
  // whose Ruby counterpart is a `String` subclass — `Arel::Nodes::SqlLiteral`
  // is the one in the tree — gets `String#blank?`'s whitespace semantics.
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

/**
 * `Object#present?` (`core_ext/object/blank.rb:25-27`): `!blank?`.
 */
export function isPresent(value: unknown): boolean {
  return !isBlank(value);
}

/**
 * `Object#presence` (`core_ext/object/blank.rb:44-46`): `self if present?`.
 * Ruby's `nil` return for a blank receiver is `undefined` here, so the
 * `presence ?? default` idiom reads the way `presence || default` does in Ruby.
 */
export function presence<T>(value: T): T | undefined {
  return isPresent(value) ? value : undefined;
}
