/**
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
import { NotImplementedError } from "../errors.js";
export interface TimeZoneConversion {
  timeZoneAwareAttributes: string[];
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

function convertTimeToTimeZone(value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter#convert_time_to_time_zone is not implemented",
  );
}

function setTimeZoneWithoutConversion(value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::AttributeMethods::TimeZoneConversion::TimeZoneConverter#set_time_zone_without_conversion is not implemented",
  );
}

function hookAttributeType(): never {
  throw new NotImplementedError(
    "ActiveRecord::AttributeMethods::TimeZoneConversion#hook_attribute_type is not implemented",
  );
}

function isCreateTimeZoneConversionAttribute(): never {
  throw new NotImplementedError(
    "ActiveRecord::AttributeMethods::TimeZoneConversion#create_time_zone_conversion_attribute? is not implemented",
  );
}
