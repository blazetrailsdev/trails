import type mysql from "mysql2/promise";
import { Date as RubyDate, Time } from "@blazetrails/date";
import { BigDecimal } from "@blazetrails/activesupport";
import { defaultTimezone } from "../../active-record.js";

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
    case "TIMESTAMP2":
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens =
        /^(\d{1,4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,6}))?/.exec(raw);
      if (!tokens) return null;
      const [year, month, day, hour, min, sec] = tokens.slice(1, 7).map(Number);
      if (year + month + day + hour + min + sec === 0) return null;
      const msec = Number((tokens[7] ?? "").padEnd(6, "0"));
      const dbTimezone =
        field.type.startsWith("TIMESTAMP") || queryOptions.databaseTimezone === "utc"
          ? "utc"
          : "local";
      const val = Time[dbTimezone](year, month, day, hour, min, sec, msec);
      return defaultTimezone() === "utc" ? val.getutc() : val.getlocal();
    }
    case "DATE":
    case "NEWDATE": {
      const raw = field.string();
      if (raw === null) return null;
      const tokens = /^(\d{1,4})-(\d{1,2})-(\d{1,2})/.exec(raw);
      if (!tokens) return null;
      const [year, month, day] = tokens.slice(1, 4).map(Number);
      if (year + month + day === 0) return null;
      return new RubyDate(year, month, day).toDate();
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
