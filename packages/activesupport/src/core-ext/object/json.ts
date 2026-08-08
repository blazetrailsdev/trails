import { Temporal } from "@blazetrails/date";

import { ActiveSupportJSON } from "../../json.js";
import { Encoding, type EncodeOptions } from "../../json/encoding.js";

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
 */
export const ToJsonWithActiveSupportEncoder = {
  toJSON(
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
  },
};

/**
 * `Object#as_json` (json.rb:58-66).
 *
 * `instance_values` (core_ext/object/instance_variables.rb:14-18) is unported;
 * a spread of the object's own enumerable properties is its analogue.
 */
export class Object {
  static asJson(value: object, options?: EncodeOptions | null): unknown {
    if (typeof (value as { toHash?: unknown }).toHash === "function") {
      return Hash.asJson((value as { toHash(): unknown }).toHash(), options);
    }
    return Hash.asJson({ ...value }, options);
  }
}

/** `TrueClass#as_json` / `FalseClass#as_json` (json.rb:80-90). */
export class TrueClass {
  static asJson(value: boolean): boolean {
    return value;
  }
}

/** `NilClass#as_json` (json.rb:92-96). */
export class NilClass {
  static asJson(value: null | undefined): null | undefined {
    return value;
  }
}

/** `String#as_json` (json.rb:98-102). */
export class String {
  static asJson(value: string): string {
    return value;
  }
}

/** `Numeric#as_json` (json.rb:110-114). */
export class Numeric {
  static asJson(value: number | bigint): number | bigint {
    return value;
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

/** `Regexp#as_json` (json.rb:139-143). */
export class Regexp {
  static asJson(value: RegExp): string {
    return globalThis.String(value);
  }
}

/** `Array#as_json` (json.rb:163-172). */
export class Array {
  static asJson(value: unknown[], options?: EncodeOptions | null): unknown[] {
    if (options) {
      return value.map((v) => asJson(v, options));
    } else {
      return value.map((v) => asJson(v));
    }
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
  static asJson(value: unknown, options?: EncodeOptions | null): Record<string, unknown> {
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

    const result: globalThis.Record<string, unknown> = {};
    if (options) {
      for (const [k, v] of subset) result[globalThis.String(k)] = asJson(v, options);
    } else {
      for (const [k, v] of subset) result[globalThis.String(k)] = asJson(v);
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
 * defines its own JSON form. Stands in for Ruby's `Hash === value`.
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

  // A class of our own that defines `as_json`, exactly as Ruby's would.
  const own = (value as { asJson?: (o?: unknown) => unknown }).asJson;
  if (typeof own === "function") return own.call(value, options ?? undefined);

  if (value instanceof Temporal.Instant || value instanceof Temporal.ZonedDateTime) {
    return Time.asJson(value);
  }
  if (value instanceof Temporal.PlainDate) return Date.asJson(value);
  if (value instanceof Temporal.PlainDateTime) return DateTime.asJson(value);
  if (value instanceof RegExp) return Regexp.asJson(value);
  if (value instanceof Error) return Exception.asJson(value);
  if (globalThis.Array.isArray(value)) return Array.asJson(value, options);
  if (value instanceof Map || isPlainObject(value as object)) return Hash.asJson(value, options);

  // A JS built-in carrying its own JSON form (`Date`, …). Ruby's counterparts
  // define `as_json`; calling `toJSON` reaches the same primitive, where
  // recursing into the instance as an attribute bag would emit `{}`.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return (value as { toJSON(): unknown }).toJSON();
  }

  return Object.asJson(value as object, options);
}
