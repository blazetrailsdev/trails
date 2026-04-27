/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
export interface TimeZoneConversion {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
}

/**
 * Time zone converter type — wraps a time type to apply zone conversion.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter
 */
export class TimeZoneConverter {
  private readonly subtype: { cast(value: unknown): unknown };

  constructor(subtype: { cast(value: unknown): unknown }) {
    this.subtype = subtype;
  }

  cast(value: unknown): unknown {
    return this.subtype.cast(value);
  }

  deserialize(value: unknown): unknown {
    return (this.subtype as any).deserialize
      ? (this.subtype as any).deserialize(value)
      : this.subtype.cast(value);
  }
}

function convertTimeToTimeZone(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => convertTimeToTimeZone(v));
  }
  return value;
}

function setTimeZoneWithoutConversion(value: unknown): unknown {
  if (value == null) return value;
  return value;
}

interface TimeZoneConversionHost {
  timeZoneAwareAttributes: boolean;
  skipTimeZoneConversionForAttributes: string[];
  timeZoneAwareTypes: string[];
  _hookAttributeType?(name: string, castType: unknown): unknown;
}

function hookAttributeType(
  this: TimeZoneConversionHost,
  name: string,
  castType: { type?: string },
): unknown {
  if (isCreateTimeZoneConversionAttribute.call(this, name, castType)) {
    return new TimeZoneConverter(castType as any);
  }
  return castType;
}

function isCreateTimeZoneConversionAttribute(
  this: TimeZoneConversionHost,
  name: string,
  castType: { type?: string },
): boolean {
  const enabledForColumn =
    this.timeZoneAwareAttributes && !this.skipTimeZoneConversionForAttributes.includes(name as any);
  return (
    enabledForColumn &&
    (this.timeZoneAwareTypes ?? ["datetime", "time"]).includes(castType.type ?? "")
  );
}
