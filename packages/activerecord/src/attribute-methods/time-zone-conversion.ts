/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import type { Type } from "@blazetrails/activemodel";
import { ValueType } from "@blazetrails/activemodel";
import { TimeWithZone, TimeZone, zone as timeZone } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/date";
import { isUtc } from "../type/internal/timezone.js";
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

  override type(): string | undefined {
    return this._subtype.type();
  }

  private get _subtypeIsUtc(): boolean | undefined {
    return resolveIsUtc(this._subtype);
  }

  override cast(value: unknown): unknown {
    if (value == null) return null;
    // Hash (multiparameter attributes): cast via subtype, then treat wall-clock
    // components as local time in the current zone (set_time_zone_without_conversion).
    if (isPlainObject(value)) {
      return setTimeZoneWithoutConversion(this._subtype.cast(value), this._subtypeIsUtc);
    }
    // TimeWithZone: move to current zone.
    if (value instanceof TimeWithZone) {
      return this.convertTimeToTimeZone(value);
    }
    // ZonedDateTime: extract instant, wrap in current zone.
    if (value instanceof Temporal.ZonedDateTime) {
      return this.convertTimeToTimeZone(value.toInstant());
    }
    // Instant: Ruby's Time responds to in_time_zone, so it takes the
    // `super(user_input_in_time_zone(value)) || super` arm rather than the
    // `map` else-branch (time_zone_conversion.rb:21-27).
    if (value instanceof Temporal.Instant) {
      return this.convertTimeToTimeZone(this._subtype.cast(value));
    }
    // PlainDateTime: wall-clock components from multiparameter assembly (no timezone).
    // Mirrors Rails' Hash branch: set_time_zone_without_conversion(super).
    if (value instanceof Temporal.PlainDateTime) {
      const instant = value.toZonedDateTime(zoneForIsUtc(this._subtypeIsUtc)).toInstant();
      return setTimeZoneWithoutConversion(instant, this._subtypeIsUtc);
    }
    // Strings: Rails gives String an in_time_zone method via CoreExt, so strings
    // take the respond_to?(:in_time_zone) branch and are parsed as local to
    // Time.zone (user_input_in_time_zone = value.in_time_zone = zone.parse(value)).
    // Without this, subtype would interpret the string in default_timezone and
    // convertTimeToTimeZone would only shift display — wrong underlying instant.
    // Parse inline (not via zone.parse()) to preserve full nanosecond precision.
    if (typeof value === "string") {
      const zone = timeZone();
      if (zone) {
        // Mirrors Rails' `super(user_input_in_time_zone(value)) || super`:
        // parse in the current zone; fall back to subtype cast if the format
        // isn't recognized (preserves support for formats parseStringInZone
        // doesn't handle, e.g. non-standard strings the subtype accepts).
        const parsed = parseStringInZone(value, zone);
        if (parsed !== null) return parsed;
        return this.convertTimeToTimeZone(this._subtype.cast(value));
      }
    }
    // Rails: `map(super) { |v| cast(v) }` (time_zone_conversion.rb:31) — the
    // DelegateClass hop to the subtype's own `map` hook, which rebuilds an
    // Array or a Range from its cast elements (oid/array.rb:67, oid/range.rb:50).
    return this.map(this._subtype.cast(value), (v) => this.cast(v));
  }

  override deserialize(value: unknown): unknown {
    return this.convertTimeToTimeZone(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): unknown {
    // Rails' DelegateClass forwards serialize to the subtype, which calls
    // cast_value on it. In Ruby, TimeWithZone acts_like?(:time) so AR's
    // DateTime type can handle it. In TS, DateTime.castValue() can't parse
    // a TimeWithZone — extract the UTC Temporal.Instant first.
    return this._subtype.serialize(this._resolveForSerialize(value));
  }

  override serializeCastValue(value: unknown): unknown {
    const resolved = this._resolveForSerialize(value);
    const sub = this._subtype as ValueTypeInstance;
    if (typeof sub.itselfIfSerializeCastValueCompatible === "function") {
      return sub.itselfIfSerializeCastValueCompatible()
        ? sub.serializeCastValue(resolved as any)
        : this._subtype.serialize(resolved);
    }
    return this._subtype.serialize(resolved);
  }

  // Rails' DelegateClass(Type::Value) auto-forwards these to the subtype; the
  // eager assert at write_from_user time is how MultiparameterAssignmentErrors
  // surface at assignment for zone-aware attributes.
  override assertValidValue(value: unknown): void {
    this._subtype.assertValidValue(value);
  }

  override isValueConstructedByMassAssignment(value: unknown): boolean {
    return this._subtype.isValueConstructedByMassAssignment(value);
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

  // Same floor-style truncation as DateTimeType._nsAtPrecision / applySecondsPrecision.
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

  // Strips TimeWithZone from any value before DB serialization. Extracts UTC
  // Temporal.Instant from TimeWithZone bounds in Range/Array values so the
  // subtype's serialize (which doesn't understand TimeWithZone) receives plain
  // Instants or timestamps.
  private _resolveForSerialize(value: unknown): unknown {
    const extractUtc = (v: unknown): unknown => (v instanceof TimeWithZone ? v.utc() : v);
    if (Array.isArray(value)) {
      return value.map((v) => (isRangeLike(v) ? mapRange(v, extractUtc) : extractUtc(v)));
    }
    if (isRangeLike(value)) return mapRange(value, extractUtc);
    return extractUtc(value);
  }

  override equals(other: Type): boolean {
    if (!(other instanceof TimeZoneConverter)) return false;
    const sub = this._subtype as ValueTypeInstance;
    return typeof sub.equals === "function"
      ? sub.equals(other._subtype)
      : this._subtype === other._subtype;
  }

  /**
   * Rails' `DelegateClass(Type::Value)` forwards `map` to the wrapped subtype,
   * so `map` is the SUBTYPE's hook: `Type::Value#map` returns the value
   * untouched (value.rb:117-119), while OID::Range and OID::Array rebuild
   * their value from the mapped elements (oid/range.rb:50-54, oid/array.rb:67-69).
   */
  override map(value: unknown, block?: (value: unknown) => unknown): unknown {
    return (this._subtype as ValueTypeInstance).map(value as never, block);
  }

  /** Mirrors: TimeZoneConverter#convert_time_to_time_zone (time_zone_conversion.rb:38-48) */
  private convertTimeToTimeZone(value: unknown): unknown {
    if (value == null) return null;

    // acts_like?(:time)
    if (value instanceof TimeWithZone || value instanceof Temporal.Instant) {
      const zone = timeZone();
      if (!zone) return value;
      return value instanceof TimeWithZone ? value.inTimeZone(zone) : new TimeWithZone(value, zone);
    }
    // value.respond_to?(:infinite?) && value.infinite?
    if (typeof value === "number" && !Number.isFinite(value)) return value;

    return this.map(value, (v) => this.convertTimeToTimeZone(v));
  }
}

/** @internal */
function zoneForIsUtc(subtypeIsUtc?: boolean): string {
  return (subtypeIsUtc ?? isUtc()) ? "UTC" : Temporal.Now.timeZoneId();
}

/**
 * Walks the `subtype` chain the way Rails' OID::Range / OID::Array delegate to
 * their subtype (range.rb:8-10, array.rb:12-13), so a wrapped
 * ActiveRecord::Type::DateTime still supplies the `is_utc?` that
 * Internal::Timezone gives it.
 *
 * @internal
 */
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
    // AcceptsMultiparameterTime builds the instant by interpreting components
    // in the is_utc? zone (UTC when default_timezone is :utc, host-local
    // when :local). Extract wall-clock components using the SAME timezone so
    // we get the original component values, then re-interpret them as local
    // time in the current zone (mirrors Time.zone.local_to_utc(t).in_time_zone).
    const zoned = value.toZonedDateTimeISO(zoneForIsUtc(subtypeIsUtc));
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
      // Normalize to a form Temporal.Instant.from() accepts (RFC 3339: no spaces,
      // colon-separated offset). TimeWithZone#toString() emits "YYYY-MM-DD HH:MM:SS ±HHMM";
      // after the space→T step the offset remains " ±HHMM" — strip the space and insert
      // the colon. Also handles: ±HH:MM (already canonical), ±HHMM (add colon), ±HH (add :00).
      const normalized = withT
        .replace(/\s*([-+])(\d{2}):?(\d{2})$/, "$1$2:$3")
        .replace(/\s*([-+]\d{2})$/, "$1:00");
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

interface RangeLike {
  readonly begin: unknown;
  readonly end: unknown;
  readonly excludeEnd: boolean;
  constructor: new (begin: unknown, end: unknown, excludeEnd: boolean) => RangeLike;
}

/** @internal */
function isRangeLike(v: unknown): v is RangeLike {
  if (v == null || typeof v !== "object" || Array.isArray(v) || isPlainObject(v)) return false;
  return "begin" in v && "end" in v && "excludeEnd" in v;
}

/** @internal */
function mapRange(range: RangeLike, fn: (v: unknown) => unknown): object {
  return new (range.constructor as any)(
    range.begin != null ? fn(range.begin) : null,
    range.end != null ? fn(range.end) : null,
    range.excludeEnd,
  );
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
