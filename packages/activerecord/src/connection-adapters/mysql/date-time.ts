import { Temporal } from "@blazetrails/activesupport/temporal";
import { formatInstantForSqlMysql } from "../abstract/quoting.js";
import { DateTime as ARDateTime } from "../../type/date-time.js";

/**
 * MySQL/MariaDB datetime type. Overrides serialize to enforce the 6-digit
 * fractional-second cap that MySQL/MariaDB DATETIME(6) enforces. The base
 * AR DateTime emits up to 9 nanosecond digits; this override caps at
 * microseconds (6 digits) so strict-mode MySQL never rejects the value.
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
