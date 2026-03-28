/**
 * Time zone conversion for ActiveRecord attributes.
 *
 * Stub: actual zone conversion is not yet implemented. The TimeZoneConverter
 * class exists to match the Rails module structure for api:compare.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */

/**
 * The TimeZoneConversion module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::TimeZoneConversion
 */
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
}
