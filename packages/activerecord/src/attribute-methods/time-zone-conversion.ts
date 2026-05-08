/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import type { Type } from "@blazetrails/activemodel";
import { ValueType } from "@blazetrails/activemodel";
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
    // TODO: requires TimeWithZone — in_time_zone branch via user_input_in_time_zone(value)
    // Fallback mirrors: map(super) { |v| cast(v) } — delegate to subtype
    return this._subtype.cast(value);
  }

  override deserialize(value: unknown): unknown {
    return convertTimeToTimeZone(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): unknown {
    return this._subtype.serialize(value);
  }

  override serializeCastValue(value: unknown): unknown {
    return this._subtype.serializeCastValue(value as any);
  }

  override equals(other: Type): boolean {
    return (
      other instanceof TimeZoneConverter &&
      (this._subtype as ValueTypeInstance).equals(other._subtype)
    );
  }
}

/** @internal */
function convertTimeToTimeZone(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => convertTimeToTimeZone(v));
  }
  // TODO: requires TimeWithZone — value.in_time_zone for time-like values
  return value;
}

/** @internal */
function setTimeZoneWithoutConversion(value: unknown): unknown {
  if (value == null) return value;
  // TODO: requires TimeWithZone — Time.zone.local_to_utc(value).try(:in_time_zone)
  return value;
}

// Silence unused-variable warnings until TimeWithZone is implemented.
void setTimeZoneWithoutConversion;

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
