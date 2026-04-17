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
 * Mirrors: ActiveRecord::QueryLogs::LegacyFormatter
 */
export const LegacyFormatter: QueryLogsFormatter = {
  format(key: string, value: TagValue): string {
    return `${key}:${value}`;
  },
  join(pairs: string[]): string {
    return pairs.join(",");
  },
};

/**
 * SQLCommenter format (OpenTelemetry standard).
 * Example: application='MyApp',controller='users'
 *
 * Mirrors: ActiveRecord::QueryLogs::SQLCommenter
 */
export const SQLCommenter: QueryLogsFormatter = {
  format(key: string, value: TagValue): string {
    return `${sqlCommenterEncode(key)}='${sqlCommenterEncode(String(value))}'`;
  },
  join(pairs: string[]): string {
    return pairs.join(",");
  },
};

function sqlCommenterEncode(value: string): string {
  return encodeURIComponent(value).replace(/'/g, "%27");
}
