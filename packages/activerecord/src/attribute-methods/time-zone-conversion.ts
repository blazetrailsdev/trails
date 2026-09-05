import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, zone as timeZone } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { classAttribute, included } from "@blazetrails/activesupport";
import { isUtc } from "../type/internal/timezone.js";
type ValueTypeInstance = InstanceType<typeof ValueType>;

interface TimeValueSubtype extends ValueType {
  userInputInTimeZone(value: unknown): unknown;
}

export interface TimeZoneConversion {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
}

interface TimeZoneConversionIncludeHost {
  name: string;
}

export const TimeZoneConversion = {
  [included](base: TimeZoneConversionIncludeHost): void {
    classAttribute.call(base, "timeZoneAwareAttributes", {
      instanceWriter: false,
      default: false,
    });
    classAttribute.call(base, "skipTimeZoneConversionForAttributes", {
      instanceWriter: false,
      default: [],
    });
    classAttribute.call(base, "timeZoneAwareTypes", {
      instanceWriter: false,
      default: ["datetime", "time"],
    });
  },
};

export class TimeZoneConverter extends ValueType<unknown> {
  private readonly _subtype: ValueType;
  override readonly name: string;

  constructor(subtype: ValueType) {
    super();
    this._subtype = subtype;
    this.name = subtype.name;
  }

  static wrap(subtype: ValueType): TimeZoneConverter {
    return subtype instanceof TimeZoneConverter ? subtype : new TimeZoneConverter(subtype);
  }

  override type(): string | undefined {
    return this._subtype.type();
  }

  private get _subtypeIsUtc(): boolean | undefined {
    return resolveIsUtc(this._subtype);
  }

  override cast(value: unknown): unknown {
    if (value == null) return null;
    if (isPlainObject(value)) {
      return setTimeZoneWithoutConversion(this._subtype.cast(value), this._subtypeIsUtc);
    }
    if (value instanceof TimeWithZone) {
      const casted = this._subtype.cast(
        (this._subtype as TimeValueSubtype).userInputInTimeZone(value),
      );
      return casted != null && casted !== false ? casted : this._subtype.cast(value);
    }
    if (value instanceof Temporal.ZonedDateTime) {
      return this.convertTimeToTimeZone(value.toInstant());
    }
    if (value instanceof Temporal.Instant) {
      return this.convertTimeToTimeZone(this._subtype.cast(value));
    }
    if (value instanceof Temporal.PlainDateTime) {
      const instant = value.toZonedDateTime(zoneForIsUtc(this._subtypeIsUtc)).toInstant();
      return setTimeZoneWithoutConversion(instant, this._subtypeIsUtc);
    }
    if (typeof value === "string") {
      const casted = this._subtype.cast(
        (this._subtype as TimeValueSubtype).userInputInTimeZone(value),
      );
      return casted != null && casted !== false ? casted : this._subtype.cast(value);
    }
    return this.map(this._subtype.cast(value), (v) => this.cast(v));
  }

  override deserialize(value: unknown): unknown {
    return this.convertTimeToTimeZone(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): unknown {
    return this._subtype.serialize(value);
  }

  override serializeCastValue(value: unknown): unknown {
    const sub = this._subtype;
    if (typeof sub.itselfIfSerializeCastValueCompatible === "function") {
      return sub.itselfIfSerializeCastValueCompatible()
        ? sub.serializeCastValue(value as any)
        : this._subtype.serialize(value);
    }
    return this._subtype.serialize(value);
  }

  override assertValidValue(value: unknown): void {
    this._subtype.assertValidValue(value);
  }

  override isValueConstructedByMassAssignment(value: unknown): boolean {
    return this._subtype.isValueConstructedByMassAssignment(value);
  }

  override isChanged(oldValue: unknown, newValue: unknown, _raw?: unknown): boolean {
    const oldInstant =
      oldValue instanceof TimeWithZone
        ? oldValue.utc().toTime().toInstant()
        : oldValue instanceof Temporal.Instant
          ? oldValue
          : null;
    const newInstant =
      newValue instanceof TimeWithZone
        ? newValue.utc().toTime().toInstant()
        : newValue instanceof Temporal.Instant
          ? newValue
          : null;
    if (oldInstant !== null && newInstant !== null) {
      return (
        this._nsAtPrecision(oldInstant.epochNanoseconds) !==
        this._nsAtPrecision(newInstant.epochNanoseconds)
      );
    }
    return oldValue !== newValue;
  }

  private _nsAtPrecision(ns: bigint): bigint {
    const raw = this._subtype.precision ?? 6;
    const p = Number.isInteger(raw) && raw >= 0 && raw <= 9 ? raw : 6;
    const mod = 10n ** BigInt(9 - p);
    let subsec = ns % 1_000_000_000n;
    if (subsec < 0n) subsec += 1_000_000_000n;
    const roundedOff = subsec % mod;
    return ns - roundedOff;
  }

  override equals(other: ValueType): boolean {
    if (!(other instanceof TimeZoneConverter)) return false;
    const sub = this._subtype;
    return typeof sub.equals === "function"
      ? sub.equals(other._subtype)
      : this._subtype === other._subtype;
  }

  override map(value: unknown, block: (value: unknown) => unknown): unknown {
    return this._subtype.map(value as never, block);
  }

  private convertTimeToTimeZone(value: unknown): unknown {
    if (value == null) return null;

    if (
      value instanceof TimeWithZone ||
      value instanceof Temporal.Instant ||
      value instanceof RubyTime
    ) {
      const zone = timeZone();
      if (!zone) return value;
      return value instanceof TimeWithZone
        ? value.inTimeZone(zone)
        : new TimeWithZone(value instanceof RubyTime ? value.toTime().toInstant() : value, zone);
    }
    if (typeof value === "number" && !Number.isFinite(value)) return value;

    return this.map(value, (v) => this.convertTimeToTimeZone(v));
  }
}

/** @internal */
function zoneForIsUtc(subtypeIsUtc?: boolean): string {
  return (subtypeIsUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId();
}

/** @internal */
function resolveIsUtc(type: unknown): boolean | undefined {
  let current = type as { isUtc?: unknown; subtype?: unknown } | null | undefined;
  const seen = new Set<unknown>();
  while (current != null && typeof current === "object" && !seen.has(current)) {
    if (typeof current.isUtc === "boolean") return current.isUtc;
    seen.add(current);
    current = current.subtype as { isUtc?: unknown; subtype?: unknown } | undefined;
  }
  return undefined;
}

/** @internal */
function setTimeZoneWithoutConversion(value: unknown, subtypeIsUtc?: boolean): unknown {
  if (value == null) return null;
  const zone = timeZone();
  if (!zone) return value;
  if (value instanceof Temporal.Instant) {
    const zoned = value.toZonedDateTimeISO(zoneForIsUtc(subtypeIsUtc));
    const pdt = zoned.toPlainDateTime();
    const base = zone.local(
      pdt.year,
      pdt.month,
      pdt.day,
      pdt.hour,
      pdt.minute,
      pdt.second,
      pdt.millisecond,
    );
    const subMs = zoned.microsecond * 1000 + zoned.nanosecond;
    if (subMs === 0) return base;
    return new TimeWithZone(
      Temporal.Instant.fromEpochNanoseconds(base.utc().toTime().epochNanoseconds + BigInt(subMs)),
      zone,
    );
  }
  if (value instanceof TimeWithZone) {
    return value.inTimeZone(zone);
  }
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

interface TimeZoneConversionHost {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
  /** @internal */
  _hookAttributeType?(name: string, castType: unknown): unknown;
}

/** @internal */
export function hookAttributeType(
  this: TimeZoneConversionHost,
  name: string,
  castType: ValueType,
): ValueType {
  if (isCreateTimeZoneConversionAttribute.call(this, name, castType)) {
    return TimeZoneConverter.wrap(castType);
  }
  return castType;
}

/** @internal */
function isCreateTimeZoneConversionAttribute(
  this: TimeZoneConversionHost,
  name: string,
  castType: ValueType,
): boolean {
  const enabledForColumn =
    this.timeZoneAwareAttributes && !this.skipTimeZoneConversionForAttributes.includes(name as any);
  return (
    enabledForColumn &&
    (this.timeZoneAwareTypes ?? ["datetime", "time"]).includes(castType.type() ?? "")
  );
}
