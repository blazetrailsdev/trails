/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import type { Type } from "@blazetrails/activemodel";
import { ValueType, configuredTimezone } from "@blazetrails/activemodel";
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
    // Strings: Rails gives String an in_time_zone method via CoreExt, so strings
    // take the respond_to?(:in_time_zone) branch and are parsed as local to
    // Time.zone (user_input_in_time_zone = value.in_time_zone = zone.parse(value)).
    // Without this, subtype would interpret the string in default_timezone and
    // convertTimeToTimeZone would only shift display — wrong underlying instant.
    if (typeof value === "string") {
      const zone = getZone();
      if (zone) {
        try {
          return zone.parse(value);
        } catch {
          return null;
        }
      }
    }
    // Temporal.Instant, etc.: cast via subtype then wrap in zone.
    // For array-like results (e.g. Range types), recurse cast() on each element
    // to mirror Rails' `map(super) { |v| cast(v) }`.
    const casted = this._subtype.cast(value);
    if (Array.isArray(casted)) {
      return casted.map((v) => this.cast(v));
    }
    return convertTimeToTimeZone(casted);
  }

  override deserialize(value: unknown): unknown {
    return convertTimeToTimeZone(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): unknown {
    // Rails' DelegateClass forwards serialize to the subtype, which calls
    // cast_value on it. In Ruby, TimeWithZone acts_like?(:time) so AR's
    // DateTime type can handle it. In TS, DateTime.castValue() can't parse
    // a TimeWithZone — extract the UTC Temporal.Instant first.
    const resolved = value instanceof TimeWithZone ? value.utc() : value;
    return this._subtype.serialize(resolved);
  }

  override serializeCastValue(value: unknown): unknown {
    const resolved = value instanceof TimeWithZone ? value.utc() : value;
    const sub = this._subtype as ValueTypeInstance;
    if (typeof sub.itselfIfSerializeCastValueCompatible === "function") {
      return sub.itselfIfSerializeCastValueCompatible()
        ? sub.serializeCastValue(resolved as any)
        : this._subtype.serialize(resolved);
    }
    return this._subtype.serialize(resolved);
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
    // AcceptsMultiparameterTime builds the instant by interpreting components
    // in configuredTimezone() (UTC when default_timezone is :utc, host-local
    // when :local). Extract wall-clock components using the SAME timezone so
    // we get the original component values, then re-interpret them as local
    // time in the current zone (mirrors Time.zone.local_to_utc(t).in_time_zone).
    const dt = value.toZonedDateTimeISO(configuredTimezone()).toPlainDateTime();
    return zone.local(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.millisecond);
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
