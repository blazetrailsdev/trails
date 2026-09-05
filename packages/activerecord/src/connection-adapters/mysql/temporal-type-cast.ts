import type mysql from "mysql2/promise";
import {
  parseMysqlInstant,
  parseMysqlDatetimeAsInstant,
  parseMysqlDate,
} from "../abstract/temporal-wire.js";

type Field = { type: string; string: () => string | null };
type NextFn = () => unknown;

/** @noRailsEquivalent PERMANENT */
export function temporalTypeCast(field: Field, next: NextFn): unknown {
  switch (field.type) {
    case "TIMESTAMP":
    case "TIMESTAMP2": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlInstant(raw);
    }
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlDatetimeAsInstant(raw);
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlDate(raw);
    }
    default:
      return next();
  }
}

export const TEMPORAL_POOL_OPTIONS: Pick<mysql.PoolOptions, "typeCast"> = {
  typeCast: temporalTypeCast as unknown as mysql.PoolOptions["typeCast"],
};
