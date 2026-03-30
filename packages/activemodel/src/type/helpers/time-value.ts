/**
 * TimeValue helper — shared behavior for time-based type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::TimeValue
 *
 * Provides precision handling and serialization for Date/DateTime/Time types.
 */
export interface TimeValue {
  serializeCastValue(value: unknown): string | null;
  applySecondsPrecision(value: Date, precision?: number): Date;
  typeCastForSchema(value: unknown): string;
  userInputInTimeZone(value: unknown): Date | null;
}

const DEFAULT_PRECISION = 0;

export function applySecondsPrecision(value: Date, precision: number = DEFAULT_PRECISION): Date {
  if (precision <= 0) {
    const result = new Date(value);
    result.setMilliseconds(0);
    return result;
  }
  if (precision >= 3) return new Date(value);
  const factor = Math.pow(10, 3 - precision);
  const result = new Date(value);
  result.setMilliseconds(Math.floor(result.getMilliseconds() / factor) * factor);
  return result;
}

export function serializeTimeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function userInputInTimeZone(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
