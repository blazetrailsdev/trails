import { DateTime as ARDateTime } from "../../type/date-time.js";

/**
 * MySQL/MariaDB datetime type. `value_for_database` returns the cast
 * Temporal.Instant (inherited near-identity serialize); the mysql2 bind layer
 * renders the SQL literal with the 6-digit fractional-second cap that
 * MySQL/MariaDB DATETIME(6) enforces (see `temporalToBindString(..., "mysql")`).
 *
 * @internal
 */
export class DateTime extends ARDateTime {}
