import { Temporal } from "@blazetrails/activesupport/temporal";
import { formatInstantForSqlMysql } from "../abstract/quoting.js";
import { DateTime as ARDateTime } from "../../type/date-time.js";

/**
 * MySQL/MariaDB datetime type. Overrides serialize to emit
 * "YYYY-MM-DD HH:MM:SS[.ffffff]" (no T, no Z) so MariaDB DATETIME
 * columns accept the value. The base DateTimeType emits ISO 8601 with
 * T and Z which MariaDB rejects in strict SQL mode.
 *
 * @internal
 */
export class DateTime extends ARDateTime {
  override serialize(value: unknown): string | null {
    const cast = this.cast(value);
    if (cast === null) return null;
    if (cast instanceof Temporal.Instant) return formatInstantForSqlMysql(cast);
    // Sentinels (DateInfinity/DateNegativeInfinity): MySQL has no infinity
    // timestamp values, so serialize to SQL NULL.
    return null;
  }
}
