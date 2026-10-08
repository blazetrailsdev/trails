import type mysql from "mysql2/promise";
import { Temporal } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import {
  parseMysqlInstant,
  parseMysqlDatetimeAsInstant,
  parseMysqlDate,
  timeFromInstant,
} from "../abstract/temporal-wire.js";

interface QueryOptions {
  databaseTimezone?: "utc" | "local";
}

export type Mysql2Client = mysql.Connection & {
  automaticClose: boolean;
  queryOptions: QueryOptions;
};

type Field = { type: string; string: () => string | null };
type TypeCast = (field: Field, next: () => unknown) => unknown;

function cast(queryOptions: QueryOptions, field: Field, next: () => unknown): unknown {
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
      return timeFromInstant(
        parseMysqlDatetimeAsInstant(
          raw,
          queryOptions.databaseTimezone === "utc" ? "UTC" : Temporal.Now.timeZoneId(),
        ),
      );
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

const QUERY_OPTIONS = new WeakSet<object>();

const AUTOMATIC_CLOSE = new WeakMap<object, boolean>();

const automaticClose: PropertyDescriptor = {
  configurable: true,
  get(this: object): boolean {
    return AUTOMATIC_CLOSE.get(this) ?? true;
  },
  set(
    this: { connection?: { stream?: { removeAllListeners?(): unknown; unref?(): unknown } } },
    value: boolean,
  ) {
    AUTOMATIC_CLOSE.set(this, value);
    if (value) return;
    const stream = this.connection?.stream;
    stream?.removeAllListeners?.();
    stream?.unref?.();
  },
};

/** @noRailsEquivalent CONVERGEABLE mysql2-perform-query-takes-rails-control-flow-over-a-gem-shaped-raw-connection */
export function mysql2Client<T extends object>(client: T): T & Mysql2Client {
  if (!QUERY_OPTIONS.has(client)) {
    QUERY_OPTIONS.add(client);
    const queryOptions: QueryOptions = {};
    Object.defineProperty(client, "queryOptions", { configurable: true, value: queryOptions });
    const config = (client as { config?: { typeCast?: unknown } }).config;
    if (config) {
      const typeCast = config.typeCast;
      config.typeCast = (field: Field, next: () => unknown) =>
        cast(
          queryOptions,
          field,
          typeof typeCast === "function" ? () => (typeCast as TypeCast)(field, next) : next,
        );
    }
  }
  return Object.defineProperty(client, "automaticClose", automaticClose) as T & Mysql2Client;
}
