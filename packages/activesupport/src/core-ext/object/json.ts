import { Temporal, Time as RubyTime } from "@blazetrails/date";

import { ActiveSupportJSON } from "../../json.js";
import { Encoding, type EncodeOptions } from "../../json/encoding.js";
import { Range as RangeValue } from "@blazetrails/ruby-compat";
import { BigDecimal as BigDecimalValue } from "../big-decimal/conversions.js";
import * as instanceVariables from "./instance-variables.js";
import { formattedOffset } from "../time/conversions.js";

export interface ToJsonWithActiveSupportEncoderHost {
  asJson(options?: EncodeOptions | null): unknown;
}

function toJSON(this: ToJsonWithActiveSupportEncoderHost, options: string): unknown;
function toJSON(this: ToJsonWithActiveSupportEncoderHost, options?: EncodeOptions | null): string;
function toJSON(
  this: ToJsonWithActiveSupportEncoderHost,
  options?: EncodeOptions | string | null,
): unknown {
  if (typeof options === "string") {
    return this.asJson();
  } else {
    return ActiveSupportJSON.encode(this, options ?? undefined);
  }
}

export const ToJsonWithActiveSupportEncoder = { toJSON };

export class Module {
  static asJson(value: { name: string }, options: EncodeOptions | null = null): string {
    return value.name;
  }
}

export class Object {
  static asJson(value: object, options: EncodeOptions | null = null): unknown {
    if (typeof (value as { toHash?: unknown }).toHash === "function") {
      return Hash.asJson((value as { toHash(): unknown }).toHash(), options);
    }
    return Hash.asJson(instanceVariables.Object.instanceValues(value), options);
  }
}

export class TrueClass {
  static asJson(value: boolean, options: EncodeOptions | null = null): boolean {
    return value;
  }
}

export class NilClass {
  static asJson(_value: null | undefined, options: EncodeOptions | null = null): null {
    return null;
  }
}

export class String {
  static asJson(value: string, options: EncodeOptions | null = null): string {
    return value;
  }
}

export class Numeric {
  static asJson(value: number | bigint, options: EncodeOptions | null = null): number | string {
    return typeof value === "bigint" ? value.toString() : value;
  }
}

export class Float {
  static asJson(value: number, options: EncodeOptions | null = null): number | null {
    return globalThis.Number.isFinite(globalThis.Number(value)) ? value : null;
  }
}

export class BigDecimal {
  static asJson(value: BigDecimalValue, options: EncodeOptions | null = null): string {
    return value.toString();
  }
}

export class Regexp {
  static asJson(value: RegExp, options: EncodeOptions | null = null): string {
    return globalThis.String(value);
  }
}

export class Enumerable {
  static asJson(value: Iterable<unknown>, options: EncodeOptions | null = null): unknown[] | null {
    return Array.asJson([...value], options);
  }
}

export class Range {
  static asJson(value: RangeValue<unknown>, options: EncodeOptions | null = null): string {
    return value.toS();
  }
}

/** @noRailsEquivalent PERMANENT */
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

export class Array {
  static asJson(value: unknown[], options: EncodeOptions | null = null): unknown[] | null {
    const frame = enterCycle(value);
    if (frame === null) return null;
    const result = frame.claim<unknown[]>([]);
    try {
      if (options) {
        if (!globalThis.Object.isFrozen(options))
          options = globalThis.Object.freeze({ ...options });
        for (const v of value) result.push(asJson(v, options));
      } else {
        for (const v of value) result.push(asJson(v));
      }
    } finally {
      frame.leave();
    }
    return result;
  }
}

export class Hash {
  static asJson(
    value: unknown,
    options: EncodeOptions | null = null,
  ): Record<string, unknown> | null {
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
      if (options) {
        if (!globalThis.Object.isFrozen(options))
          options = globalThis.Object.freeze({ ...options });
        for (const [k, v] of subset) {
          globalThis.Object.defineProperty(result, globalThis.String(k), {
            value: asJson(v, options),
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      } else {
        for (const [k, v] of subset) {
          globalThis.Object.defineProperty(result, globalThis.String(k), {
            value: asJson(v),
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
    } finally {
      frame.leave();
    }
    return result;
  }
}

export class Time {
  static asJson(
    value: RubyTime | Temporal.Instant | Temporal.ZonedDateTime,
    options: EncodeOptions | null = null,
  ): string {
    const digits =
      Encoding.timePrecision as Temporal.ToStringPrecisionOptions["fractionalSecondDigits"];

    if (value instanceof RubyTime) {
      if (Encoding.useStandardJsonTimeFormat) return value.xmlschema(Encoding.timePrecision);
      return `${value.strftime("%Y/%m/%d %H:%M:%S")} ${formattedOffset(value, false)}`;
    }

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

export class Date {
  static asJson(value: Temporal.PlainDate, options: EncodeOptions | null = null): string {
    if (Encoding.useStandardJsonTimeFormat) {
      return value.toString();
    } else {
      return `${value.year}/${pad2(value.month)}/${pad2(value.day)}`;
    }
  }
}

export class DateTime {
  static asJson(value: Temporal.PlainDateTime, options: EncodeOptions | null = null): string {
    const digits =
      Encoding.timePrecision as Temporal.ToStringPrecisionOptions["fractionalSecondDigits"];

    if (Encoding.useStandardJsonTimeFormat) {
      return `${value.toString({ fractionalSecondDigits: digits })}+00:00`;
    } else {
      return slashFormat(value, "+0000");
    }
  }
}

export class Generic {
  static asJson(value: URL, options: EncodeOptions | null = null): string {
    return value.toString();
  }
}

export class Exception {
  static asJson(value: Error, options: EncodeOptions | null = null): string {
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

/** @noRailsEquivalent PERMANENT */
export function isPlainObject(value: object): boolean {
  const proto = globalThis.Object.getPrototypeOf(value);
  return proto === globalThis.Object.prototype || proto === null;
}

export function asJson(value: unknown, options: EncodeOptions | null = null): unknown {
  if (value == null) return NilClass.asJson(value, options);
  if (typeof value === "boolean") return TrueClass.asJson(value, options);
  if (typeof value === "string") return String.asJson(value, options);
  if (typeof value === "number" || value instanceof globalThis.Number) {
    return Float.asJson(value as number, options);
  }
  if (typeof value === "bigint") return Numeric.asJson(value, options);

  const own = (value as { asJson?: (o?: unknown) => unknown }).asJson;
  if (typeof own === "function") return own.call(value, options ?? undefined);

  if (typeof value === "function") return Module.asJson(value as { name: string }, options);

  if (
    value instanceof RubyTime ||
    value instanceof Temporal.Instant ||
    value instanceof Temporal.ZonedDateTime
  ) {
    return Time.asJson(value, options);
  }
  if (value instanceof Temporal.PlainDate) return Date.asJson(value, options);
  if (value instanceof Temporal.PlainDateTime) return DateTime.asJson(value, options);
  if (value instanceof BigDecimalValue) return BigDecimal.asJson(value, options);
  if (value instanceof RegExp) return Regexp.asJson(value, options);
  if (value instanceof Error) return Exception.asJson(value, options);
  if (value instanceof URL) return Generic.asJson(value, options);
  if (globalThis.Array.isArray(value)) return Array.asJson(value, options);
  if (value instanceof RangeValue) return Range.asJson(value, options);
  if (value instanceof Map || isPlainObject(value as object)) return Hash.asJson(value, options);
  if (
    typeof (value as { [globalThis.Symbol.iterator]?: unknown })[globalThis.Symbol.iterator] ===
    "function"
  ) {
    return Enumerable.asJson(value as Iterable<unknown>, options);
  }

  if (typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return (value as { toJSON(): unknown }).toJSON();
  }

  return Object.asJson(value as object, options);
}
