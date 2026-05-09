/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import type { Type } from "@blazetrails/activemodel";
import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, getZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
type ValueTypeInstance = InstanceType<typeof ValueType>;

export interface TimeZoneConversion {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
}

/**
 * Time zone converter type — wraps a time type to apply zone conversion.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter
 * Rails uses `DelegateClass(Type::Value)` to auto-delegate all methods; we extend
 * ValueType and explicitly delegate type/cast/deserialize/serialize/serializeCastValue
 * to the wrapped subtype. Other Type methods (isChanged, isSerializable, etc.) fall
 * back to ValueType defaults, matching the base type's behavior for time values.
 */
export class TimeZoneConverter extends ValueType<unknown> {
  private readonly _subtype: Type;
  override readonly name: string;

  constructor(subtype: Type) {
    super();
    this._subtype = subtype;
    this.name = subtype.name;
  }

  /** Idempotent factory — mirrors Rails' `self.new` guard. */
  static wrap(subtype: Type): TimeZoneConverter {
    return subtype instanceof TimeZoneConverter ? subtype : new TimeZoneConverter(subtype);
  }

  override type(): string {
    return this._subtype.type();
  }

  override cast(value: unknown): unknown {
    if (value == null) return null;
    // Hash (multiparameter attributes): cast via subtype, then treat wall-clock
    // components as local time in the current zone (set_time_zone_without_conversion).
    if (isPlainObject(value)) {
      return setTimeZoneWithoutConversion(this._subtype.cast(value));
    }
    // TimeWithZone or any value with in_time_zone: move to current zone.
    if (value instanceof TimeWithZone) {
      return convertTimeToTimeZone(value);
    }
    // String, Temporal.Instant, Date, etc.: cast via subtype then wrap in zone.
    return convertTimeToTimeZone(this._subtype.cast(value));
  }

  override deserialize(value: unknown): unknown {
    return convertTimeToTimeZone(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): unknown {
    return this._subtype.serialize(value);
  }

  override serializeCastValue(value: unknown): unknown {
    const sub = this._subtype as ValueTypeInstance;
    if (typeof sub.itselfIfSerializeCastValueCompatible === "function") {
      return sub.itselfIfSerializeCastValueCompatible()
        ? sub.serializeCastValue(value as any)
        : this._subtype.serialize(value);
    }
    return this._subtype.serialize(value);
  }

  override equals(other: Type): boolean {
    if (!(other instanceof TimeZoneConverter)) return false;
    const sub = this._subtype as ValueTypeInstance;
    return typeof sub.equals === "function"
      ? sub.equals(other._subtype)
      : this._subtype === other._subtype;
  }
}

/** @internal */
function convertTimeToTimeZone(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => convertTimeToTimeZone(v));
  }
  const zone = getZone();
  if (!zone) return value;
  if (value instanceof TimeWithZone) {
    return value.inTimeZone(zone);
  }
  if (value instanceof Temporal.Instant) {
    return new TimeWithZone(value, zone);
  }
  return value;
}

/** @internal */
function setTimeZoneWithoutConversion(value: unknown): unknown {
  if (value == null) return null;
  const zone = getZone();
  if (!zone) return value;
  if (value instanceof Temporal.Instant) {
    // The subtype cast treats multiparameter hash components as UTC wall-clock
    // values. Re-interpret those wall-clock components as local time in the
    // current zone (mirrors Time.zone.local_to_utc(localTime).in_time_zone).
    const dt = value.toZonedDateTimeISO("UTC").toPlainDateTime();
    return zone.local(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);
  }
  if (value instanceof TimeWithZone) {
    return value.inTimeZone(zone);
  }
  return value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
}

interface TimeZoneConversionHost {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
  _hookAttributeType?(name: string, castType: unknown): unknown;
}

/**
 * @internal
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion::ClassMethods#hook_attribute_type
 */
export function hookAttributeType(
  this: TimeZoneConversionHost,
  name: string,
  castType: Type,
): Type {
  if (isCreateTimeZoneConversionAttribute.call(this, name, castType)) {
    return TimeZoneConverter.wrap(castType);
  }
  return castType;
}

/** @internal */
function isCreateTimeZoneConversionAttribute(
  this: TimeZoneConversionHost,
  name: string,
  castType: Type,
): boolean {
  const enabledForColumn =
    this.timeZoneAwareAttributes && !this.skipTimeZoneConversionForAttributes.includes(name as any);
  return (
    enabledForColumn &&
    (this.timeZoneAwareTypes ?? ["datetime", "time"]).includes(castType.type() ?? "")
  );
}
