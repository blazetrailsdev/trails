import type mysql from "mysql2/promise";
import { BigDecimal } from "@blazetrails/activesupport";
import {
  parseMysqlInstant,
  parseMysqlDatetimeAsInstant,
  parseMysqlDate,
  timeFromInstant,
} from "../abstract/temporal-wire.js";

type Field = { type: string; string: () => string | null };
type NextFn = () => unknown;

/** @noRailsEquivalent CONVERGEABLE pg-and-mysql-wire-casts-register-where-rails-configures-the-driver */
export function temporalTypeCast(field: Field, next: NextFn): unknown {
  switch (field.type) {
    case "TIMESTAMP":
    case "TIMESTAMP2": {
      const raw = field.string();
      if (raw === null) return null;
      return timeFromInstant(parseMysqlInstant(raw));
    }
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      return timeFromInstant(parseMysqlDatetimeAsInstant(raw));
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlDate(raw);
    }
    case "DECIMAL":
    case "NEWDECIMAL": {
      const raw = next();
      if (typeof raw !== "string") return raw;
      if (raw.includes(".")) return new BigDecimal(raw);
      return Number.isSafeInteger(Number(raw)) ? Number(raw) : BigInt(raw);
    }
    case "LONGLONG": {
      const raw = next();
      return typeof raw === "string" ? BigInt(raw) : raw;
    }
    default:
      return next();
  }
}

export const TEMPORAL_POOL_OPTIONS: Pick<mysql.PoolOptions, "typeCast"> = {
  typeCast: temporalTypeCast as unknown as mysql.PoolOptions["typeCast"],
};
