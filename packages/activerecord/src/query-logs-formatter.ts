/**
 * Query log formatters — format key/value pairs for SQL comment annotations.
 *
 * Mirrors: ActiveRecord::QueryLogs::LegacyFormatter
 *          ActiveRecord::QueryLogs::SQLCommenter
 */

export type TagValue = string | number | boolean | null | undefined;

export interface QueryLogsFormatter {
  format(key: string, value: TagValue): string;
  join(pairs: string[]): string;
}

/**
 * Legacy Rails format: key:value pairs separated by commas.
 * Example: application:MyApp,controller:users
 *
 * Mirrors: ActiveRecord::QueryLogs::LegacyFormatter — Rails exposes
 * this as a singleton class (`class << self`). In TS we model it as
 * a class with static methods so consumers call
 * `LegacyFormatter.format(k, v)` the same way they'd call
 * `LegacyFormatter.format` in Ruby.
 */
export class LegacyFormatter {
  static format(key: string, value: TagValue): string {
    return `${key}:${value}`;
  }
  static join(pairs: string[]): string {
    return pairs.join(",");
  }
}

/**
 * SQLCommenter format (OpenTelemetry standard).
 * Example: application='MyApp',controller='users'
 *
 * Mirrors: ActiveRecord::QueryLogs::SQLCommenter (Rails singleton
 * class). Static-method class keeps the `SQLCommenter.format(...)` /
 * `.join(...)` call shape users write in Ruby.
 */
export class SQLCommenter {
  static format(key: string, value: TagValue): string {
    return `${sqlCommenterEncode(key)}='${sqlCommenterEncode(String(value))}'`;
  }
  static join(pairs: string[]): string {
    return pairs.join(",");
  }
}

function sqlCommenterEncode(value: string): string {
  return encodeURIComponent(value).replace(/'/g, "%27");
}
