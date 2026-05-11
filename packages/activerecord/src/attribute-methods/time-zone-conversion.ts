/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import type { Type } from "@blazetrails/activemodel";
import { ValueType, configuredTimezone } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone, getZone } from "@blazetrails/activesupport";
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
 * to the wrapped subtype. `isChanged` is also overridden to compare instants by value
 * at the subtype's column precision (matching Rails' `TimeWithZone#==` semantics).
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
    // TimeWithZone: move to current zone.
    if (value instanceof TimeWithZone) {
      return convertTimeToTimeZone(value);
    }
    // ZonedDateTime: extract instant, wrap in current zone.
    if (value instanceof Temporal.ZonedDateTime) {
      return convertTimeToTimeZone(value.toInstant());
    }
    // PlainDateTime: wall-clock components from multiparameter assembly (no timezone).
    // Mirrors Rails' Hash branch: set_time_zone_without_conversion(super).
    // Convert to instant via configuredTimezone() then re-interpret in current zone.
    if (value instanceof Temporal.PlainDateTime) {
      const instant = value.toZonedDateTime(configuredTimezone()).toInstant();
      return setTimeZoneWithoutConversion(instant);
    }
    // Strings: Rails gives String an in_time_zone method via CoreExt, so strings
    // take the respond_to?(:in_time_zone) branch and are parsed as local to
    // Time.zone (user_input_in_time_zone = value.in_time_zone = zone.parse(value)).
    // Without this, subtype would interpret the string in default_timezone and
    // convertTimeToTimeZone would only shift display — wrong underlying instant.
    // Parse inline (not via zone.parse()) to preserve full nanosecond precision.
    if (typeof value === "string") {
      const zone = getZone();
      if (zone) {
        // Mirrors Rails' `super(user_input_in_time_zone(value)) || super`:
        // parse in the current zone; fall back to subtype cast if the format
        // isn't recognized (preserves support for formats parseStringInZone
        // doesn't handle, e.g. non-standard strings the subtype accepts).
        const parsed = parseStringInZone(value, zone);
        if (parsed !== null) return parsed;
        return convertTimeToTimeZone(this._subtype.cast(value));
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

  override isChanged(oldValue: unknown, newValue: unknown, _raw?: unknown): boolean {
    const oldInstant =
      oldValue instanceof TimeWithZone
        ? oldValue.utc()
        : oldValue instanceof Temporal.Instant
          ? oldValue
          : null;
    const newInstant =
      newValue instanceof TimeWithZone
        ? newValue.utc()
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

  // Same floor-style truncation as DateTimeType._nsAtPrecision / _applySecondsPrecision.
  // Uses the wrapped subtype's precision so behavior matches the column's serialize output.
  private _nsAtPrecision(ns: bigint): bigint {
    const raw = this._subtype.precision ?? 6;
    const p = Number.isInteger(raw) && raw >= 0 && raw <= 9 ? raw : 6;
    const mod = 10n ** BigInt(9 - p);
    let subsec = ns % 1_000_000_000n;
    if (subsec < 0n) subsec += 1_000_000_000n;
    const roundedOff = subsec % mod;
    return ns - roundedOff;
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
    const zoned = value.toZonedDateTimeISO(configuredTimezone());
    const pdt = zoned.toPlainDateTime();
    // zone.local() takes milliseconds; get the ms-level result with correct DST
    // disambiguation, then add back sub-millisecond precision from the original.
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
      Temporal.Instant.fromEpochNanoseconds(base.utc().epochNanoseconds + BigInt(subMs)),
      zone,
    );
  }
  if (value instanceof TimeWithZone) {
    return value.inTimeZone(zone);
  }
  return value;
}

/** @internal */
function parseStringInZone(value: string, zone: TimeZone): TimeWithZone | null {
  try {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    // Normalize space separator → T first (e.g. "2024-06-15 10:30:00-04:00").
    const withT = trimmed.replace(" ", "T");
    // Detect offset: Z/z, ±HH:MM, ±HHMM, or short ±HH (without minutes).
    if (/[Zz]$|[+-]\d{2}(?::?\d{2})?$/.test(withT)) {
      // Normalize short offsets ±HH → ±HH:00 so Temporal.Instant.from() accepts them.
      const normalized = withT.replace(/([-+]\d{2})$/, "$1:00");
      return new TimeWithZone(Temporal.Instant.from(normalized), zone);
    }
    // No offset → wall-clock components local to the current zone.
    // Date-only strings ("YYYY-MM-DD") → midnight, matching Rails' in_time_zone behavior.
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(withT);
    const datetimeStr = isDateOnly ? `${withT}T00:00:00` : withT;
    const pdt = Temporal.PlainDateTime.from(datetimeStr, { overflow: "reject" });
    // zone.local() gives correct DST disambiguation at millisecond precision;
    // add back sub-millisecond precision (microseconds + nanoseconds) separately.
    const base = zone.local(
      pdt.year,
      pdt.month,
      pdt.day,
      pdt.hour,
      pdt.minute,
      pdt.second,
      pdt.millisecond,
    );
    const subMs = pdt.microsecond * 1000 + pdt.nanosecond;
    if (subMs === 0) return base;
    return new TimeWithZone(
      Temporal.Instant.fromEpochNanoseconds(base.utc().epochNanoseconds + BigInt(subMs)),
      zone,
    );
  } catch {
    return null;
  }
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
