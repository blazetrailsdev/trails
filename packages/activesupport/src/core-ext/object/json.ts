import { Temporal } from "@blazetrails/date";

import { ActiveSupportJSON } from "../../json.js";
import { Encoding, type EncodeOptions } from "../../json/encoding.js";
import { Range as RangeValue } from "@blazetrails/ruby-compat";
import { BigDecimal as BigDecimalValue } from "../big-decimal/conversions.js";
import * as instanceVariables from "./instance-variables.js";

/**
 * Rails' `core_ext/object/json.rb` — the `as_json` layer
 * `JSONGemEncoder#jsonify` dispatches through (json/encoding.rb:103).
 *
 * Ruby reopens every core class and defines `as_json` on it; method lookup then
 * picks the right one. TypeScript cannot reopen built-ins, so each Ruby class'
 * body lives on a class of the same name with a `static asJson(value, options)`
 * — the same shape `core-ext/object/blank.ts` uses for `blank?`/`present?` —
 * and the free `asJson()` below stands in for Ruby's method lookup.
 */

/**
 * The receiver `ToJsonWithActiveSupportEncoder#to_json` is mixed into.
 * Ruby's `super` reaches the JSON gem's `to_json`; the JS analogue is the
 * receiver's own `as_json` value, which `JSON.stringify` then serializes.
 */
export interface ToJsonWithActiveSupportEncoderHost {
  asJson(options?: EncodeOptions | null): unknown;
}

/**
 * `ActiveSupport::ToJsonWithActiveSupportEncoder#to_json` (json.rb:35-43),
 * the hook that routes `to_json` through ActiveSupport's encoder rather than
 * the JSON gem's. Ruby includes it into `[Enumerable, Object, Array,
 * FalseClass, Float, Hash, Integer, NilClass, String, TrueClass]`
 * (json.rb:47-49); TypeScript cannot reopen built-ins, so it is assigned onto
 * the classes of ours that define an `asJson` (the mixin idiom — a
 * `this`-typed function).
 *
 * Ruby discriminates on `::JSON::State`, the argument the JSON gem's encoder
 * passes. `JSON.stringify` has no state object: it calls `toJSON(key)` with
 * the property key, a string — so the string is the discriminator here.
 *
 * Both Ruby arms answer a String, so the arm callers reach — no argument or an
 * options hash — is declared `string`. It is the *last* overload deliberately:
 * `Included<>` derives a host's method type by inferring from the final
 * signature, so that is the one the mixin hosts get.
 */
function toJSON(this: ToJsonWithActiveSupportEncoderHost, options: string): unknown;
function toJSON(this: ToJsonWithActiveSupportEncoderHost, options?: EncodeOptions | null): string;
function toJSON(
  this: ToJsonWithActiveSupportEncoderHost,
  options?: EncodeOptions | string | null,
): unknown {
  if (typeof options === "string") {
    // Called from JSON.stringify, forward it to the JSON serializer
    return this.asJson();
  } else {
    // to_json is being invoked directly, use ActiveSupport's encoder
    return ActiveSupportJSON.encode(this, options ?? undefined);
  }
}

export const ToJsonWithActiveSupportEncoder = { toJSON };

/**
 * `Module#as_json` (json.rb:52-56). A JS class or function is the Module
 * analogue, and `name` is the same reader Ruby's is.
 */
export class Module {
  static asJson(value: { name: string }): string {
    return value.name;
  }
}

/** `Object#as_json` (json.rb:58-66). */
export class Object {
  static asJson(value: object, options?: EncodeOptions | null): unknown {
    if (typeof (value as { toHash?: unknown }).toHash === "function") {
      return Hash.asJson((value as { toHash(): unknown }).toHash(), options);
    }
    return Hash.asJson(instanceVariables.Object.instanceValues(value), options);
  }
}

/** `TrueClass#as_json` / `FalseClass#as_json` (json.rb:80-90). */
export class TrueClass {
  static asJson(value: boolean): boolean {
    return value;
  }
}

/**
 * `NilClass#as_json` (json.rb:92-96) — Ruby answers `nil` for its one absent
 * value. JS has two, and `JSON.stringify` silently *drops* a property whose
 * value is `undefined` rather than emitting `null`, so both absences answer
 * `null` here to reach Ruby's single JSON form.
 */
export class NilClass {
  static asJson(_value: null | undefined): null {
    return null;
  }
}

/** `String#as_json` (json.rb:98-102). */
export class String {
  static asJson(value: string): string {
    return value;
  }
}

/**
 * `Numeric#as_json` (json.rb:110-114) — Ruby answers `self`, and its encoder
 * renders an arbitrary-precision Integer as a JSON number.
 *
 * A JS `bigint` is the analogue of that Integer, but `JSON.stringify` throws
 * `TypeError: Do not know how to serialize a BigInt` on one and a JS `number`
 * loses precision above 2^53-1, so there is no way to answer `self` and stay
 * encodable. It answers the decimal digits as a string instead; consumers
 * recover the value with `BigInt(str)`.
 */
export class Numeric {
  static asJson(value: number | bigint): number | string {
    return typeof value === "bigint" ? value.toString() : value;
  }
}

/**
 * `Float#as_json` (json.rb:116-122) — Infinity and NaN encode to `null`, since
 * "Infinity"/"NaN" are not valid JSON.
 */
export class Float {
  static asJson(value: number): number | null {
    return globalThis.Number.isFinite(value) ? value : null;
  }
}

/**
 * `BigDecimal#as_json` (json.rb:124-137) — a JSON *string*, deliberately, so a
 * client parsing non-integer JSON numbers as floats can still recover the exact
 * value. trails' `BigDecimal` (core-ext/big-decimal/conversions.ts) holds
 * normalized digit strings, so it has no infinite or NaN value and `finite?` is
 * always true.
 */
export class BigDecimal {
  static asJson(value: BigDecimalValue): string {
    return value.toString();
  }
}

/** `Regexp#as_json` (json.rb:139-143). */
export class Regexp {
  static asJson(value: RegExp): string {
    return globalThis.String(value);
  }
}

/**
 * `Enumerable#as_json` (json.rb:145-149). Ruby's `Enumerable` is our iterable —
 * a `Set`, a generator — and `[...value]` is its `to_a`.
 */
export class Enumerable {
  static asJson(value: Iterable<unknown>, options?: EncodeOptions | null): unknown[] | null {
    return Array.asJson([...value], options);
  }
}

/**
 * `Range#as_json` (json.rb:157-161).
 */
export class Range {
  static asJson(value: RangeValue<unknown>): string {
    return value.toS();
  }
}

/**
 * Cycle bookkeeping for the `Array#as_json` / `Hash#as_json` recursion above —
 * Ruby's `v.as_json` at json.rb:167 and :192-194.
 *
 * `null` means the value is already being built one frame up, i.e. a true
 * cycle; otherwise the frame hands back the container to fill (memoized before
 * it is filled, so a second reference to the same value answers the same
 * result) and `leave()` closes it.
 *
 * @noRailsEquivalent PERMANENT — Ruby's recursion has no guard: a cyclic
 *   structure raises
 *   SystemStackError, which a caller can rescue and which leaves the process
 *   usable. A JS RangeError from the same recursion unwinds a native stack the
 *   engine gives no comparable recovery for, so a cycle answers `nil` — the
 *   value Ruby's own `NilClass#as_json` would have produced for the absent
 *   branch — rather than felling the encode
 */
function enterCycle(value: object): CycleFrame | null {
  if (inProgress.has(value)) return null;
  if (memo.has(value)) return { claim: () => memo.get(value), leave: () => {} } as CycleFrame;
  inProgress.add(value);
  depth += 1;
  return {
    claim: (container) => {
      memo.set(value, container);
      return container;
    },
    leave: () => {
      inProgress.delete(value);
      depth -= 1;
      if (depth === 0) memo = new WeakMap();
    },
  };
}

interface CycleFrame {
  claim<T extends object>(container: T): T;
  leave(): void;
}

let depth = 0;
const inProgress = new WeakSet<object>();
let memo = new WeakMap<object, unknown>();

/**
 * `Array#as_json` (json.rb:163-172). The `map` is guarded (see `enterCycle`) —
 * a JS `RangeError` from a cyclic structure is not recoverable the way Ruby's
 * `SystemStackError` is.
 */
export class Array {
  static asJson(value: unknown[], options?: EncodeOptions | null): unknown[] | null {
    const frame = enterCycle(value);
    if (frame === null) return null;
    const result = frame.claim<unknown[]>([]);
    try {
      for (const v of value) result.push(options ? asJson(v, options) : asJson(v));
    } finally {
      frame.leave();
    }
    return result;
  }
}

/**
 * `Hash#as_json` (json.rb:174-197) — `only`/`except` select a subset, then every
 * value is recursed with the same options.
 *
 * Ruby's Hash is our plain object and our `Map`; `Array(attrs)` is the scalar-or
 * -list coercion inline in each arm. `if attrs = options[:only]` (`:178`) is
 * Ruby-truthy, so a stored `false` falls through to the `except` arm — the
 * index signature on `EncodeOptions` lets one reach here.
 */
export class Hash {
  static asJson(value: unknown, options?: EncodeOptions | null): Record<string, unknown> | null {
    const entries =
      value instanceof Map
        ? [...value.entries()]
        : globalThis.Object.entries(value as globalThis.Record<string, unknown>);

    let subset = entries;
    if (options) {
      let attrs: unknown;
      if ((attrs = options.only) != null && attrs !== false) {
        const keys = new Set(
          (globalThis.Array.isArray(attrs) ? attrs : [attrs]).map(globalThis.String),
        );
        subset = entries.filter(([k]) => keys.has(globalThis.String(k)));
      } else if ((attrs = options.except) != null && attrs !== false) {
        const keys = new Set(
          (globalThis.Array.isArray(attrs) ? attrs : [attrs]).map(globalThis.String),
        );
        subset = entries.filter(([k]) => !keys.has(globalThis.String(k)));
      }
    }

    const frame = enterCycle(value as object);
    if (frame === null) return null;
    const result = frame.claim<globalThis.Record<string, unknown>>({});
    try {
      // Ruby's `hash[key] = value` always writes an entry. A JS assignment to
      // `__proto__` — an own key any `JSON.parse` output can carry — invokes
      // `Object.prototype`'s accessor and reparents the result instead, so the
      // write goes through `defineProperty` to stay a plain data entry.
      for (const [k, v] of subset) {
        globalThis.Object.defineProperty(result, globalThis.String(k), {
          value: options ? asJson(v, options) : asJson(v),
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
    } finally {
      frame.leave();
    }
    return result;
  }
}

/**
 * `Time#as_json` (json.rb:200-208), over our Temporal analogues: `Instant` and
 * `ZonedDateTime`. `xmlschema` renders a zero offset as "Z"
 * (`formatted_offset(true, 'Z')`), which the ZonedDateTime arm reproduces.
 */
export class Time {
  static asJson(value: Temporal.Instant | Temporal.ZonedDateTime): string {
    const digits =
      Encoding.timePrecision as Temporal.ToStringPrecisionOptions["fractionalSecondDigits"];

    if (value instanceof Temporal.Instant) {
      if (Encoding.useStandardJsonTimeFormat) {
        return value.toString({ fractionalSecondDigits: digits });
      }
      return slashFormat(value.toZonedDateTimeISO("UTC"), "+0000");
    }

    if (Encoding.useStandardJsonTimeFormat) {
      const formatted = value.toString({ fractionalSecondDigits: digits, timeZoneName: "never" });
      return value.offsetNanoseconds === 0 ? `${formatted.slice(0, -6)}Z` : formatted;
    }
    return slashFormat(value, value.offset.replaceAll(":", ""));
  }
}

/** `Date#as_json` (json.rb:210-218), over `Temporal.PlainDate`. */
export class Date {
  static asJson(value: Temporal.PlainDate): string {
    if (Encoding.useStandardJsonTimeFormat) {
      return value.toString();
    } else {
      return `${value.year}/${pad2(value.month)}/${pad2(value.day)}`;
    }
  }
}

/**
 * `DateTime#as_json` (json.rb:220-228), over the zoneless
 * `Temporal.PlainDateTime` — whose `xmlschema` carries Ruby's default `+00:00`
 * offset.
 */
export class DateTime {
  static asJson(value: Temporal.PlainDateTime): string {
    const digits =
      Encoding.timePrecision as Temporal.ToStringPrecisionOptions["fractionalSecondDigits"];

    if (Encoding.useStandardJsonTimeFormat) {
      return `${value.toString({ fractionalSecondDigits: digits })}+00:00`;
    } else {
      return slashFormat(value, "+0000");
    }
  }
}

/**
 * `URI::Generic#as_json` (json.rb:230-234). JS `URL` is the analogue of Ruby's
 * parsed-URI object, and `toString()` is its `to_s`.
 */
export class Generic {
  static asJson(value: URL): string {
    return value.toString();
  }
}

/** `Exception#as_json` (json.rb:256-260). */
export class Exception {
  static asJson(value: Error): string {
    return value.message;
  }
}

function slashFormat(
  value: Temporal.ZonedDateTime | Temporal.PlainDateTime,
  offset: string,
): string {
  return (
    `${value.year}/${pad2(value.month)}/${pad2(value.day)} ` +
    `${pad2(value.hour)}:${pad2(value.minute)}:${pad2(value.second)} ${offset}`
  );
}

function pad2(value: number): string {
  return globalThis.String(value).padStart(2, "0");
}

/**
 * @noRailsEquivalent PERMANENT — a Hash-shaped object: a bare object literal
 * (`Object.prototype` or null prototype), not a class instance like `Date` that
 * defines its own JSON form. Stands in for Ruby's `Hash === value`, both in the
 * dispatcher below and in `JSONGemEncoder#jsonify`.
 */
export function isPlainObject(value: object): boolean {
  const proto = globalThis.Object.getPrototypeOf(value);
  return proto === globalThis.Object.prototype || proto === null;
}

/**
 * Ruby resolves `value.as_json` by method lookup across the
 * classes this file reopens; TypeScript cannot reopen built-ins, so one
 * dispatcher selects the arm the receiver's class would have provided. The
 * arms are ordered most-specific first, as Ruby's lookup is.
 */
export function asJson(value: unknown, options?: EncodeOptions | null): unknown {
  if (value == null) return NilClass.asJson(value);
  if (typeof value === "boolean") return TrueClass.asJson(value);
  if (typeof value === "string") return String.asJson(value);
  if (typeof value === "number") return Float.asJson(value);
  if (typeof value === "bigint") return Numeric.asJson(value);

  // A class of our own that defines `as_json`, exactly as Ruby's would. A
  // `def self.as_json` singleton outranks `Module#as_json` in Ruby's lookup,
  // so this precedes the Module arm.
  const own = (value as { asJson?: (o?: unknown) => unknown }).asJson;
  if (typeof own === "function") return own.call(value, options ?? undefined);

  if (typeof value === "function") return Module.asJson(value as { name: string });

  if (value instanceof Temporal.Instant || value instanceof Temporal.ZonedDateTime) {
    return Time.asJson(value);
  }
  if (value instanceof Temporal.PlainDate) return Date.asJson(value);
  if (value instanceof Temporal.PlainDateTime) return DateTime.asJson(value);
  if (value instanceof BigDecimalValue) return BigDecimal.asJson(value);
  if (value instanceof RegExp) return Regexp.asJson(value);
  if (value instanceof Error) return Exception.asJson(value);
  if (value instanceof URL) return Generic.asJson(value);
  if (globalThis.Array.isArray(value)) return Array.asJson(value, options);
  if (value instanceof RangeValue) return Range.asJson(value);
  if (value instanceof Map || isPlainObject(value as object)) return Hash.asJson(value, options);
  if (
    typeof (value as { [globalThis.Symbol.iterator]?: unknown })[globalThis.Symbol.iterator] ===
    "function"
  ) {
    return Enumerable.asJson(value as Iterable<unknown>, options);
  }

  // A JS built-in carrying its own JSON form (`Date`, …). Ruby's counterparts
  // define `as_json`; calling `toJSON` reaches the same primitive, where
  // recursing into the instance as an attribute bag would emit `{}`.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return (value as { toJSON(): unknown }).toJSON();
  }

  return Object.asJson(value as object, options);
}
