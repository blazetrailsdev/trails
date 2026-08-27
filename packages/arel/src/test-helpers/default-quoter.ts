import type { ArelConnection } from "../visitors/connection.js";
import { Temporal } from "@blazetrails/date";
import { toS } from "@blazetrails/activesupport";

function defaultSanitizeAsSqlComment(value: string): string {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type TemporalDateLike =
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

function quotedDate(value: TemporalDateLike): string {
  if (value instanceof Temporal.Instant)
    return formatPlainDateTime(value.toZonedDateTimeISO("UTC"));
  if (value instanceof Temporal.ZonedDateTime)
    return formatPlainDateTime(value.toInstant().toZonedDateTimeISO("UTC"));
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTime(value);
  if (value instanceof Temporal.PlainDate) {
    return `${padYear(value.year)}-${pad(value.month)}-${pad(value.day)}`;
  }
  return formatPlainDateTime(withEpochDate(value));
}

function quotedTime(value: Temporal.PlainTime | Temporal.PlainDateTime): string {
  return quotedDate(withEpochDate(value)).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

function withEpochDate(value: Temporal.PlainTime | Temporal.PlainDateTime): Temporal.PlainDateTime {
  if (value instanceof Temporal.PlainDateTime) return value.with({ year: 2000, month: 1, day: 1 });
  return new Temporal.PlainDateTime(
    2000,
    1,
    1,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    value.nanosecond,
  );
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function padYear(year: number): string {
  return year < 0 ? String(year) : String(year).padStart(4, "0");
}

function formatPlainDateTime(v: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
}): string {
  const usec = v.millisecond * 1000 + v.microsecond;
  const frac = usec > 0 ? `.${pad(usec, 6)}` : "";
  return `${padYear(v.year)}-${pad(v.month)}-${pad(v.day)} ${pad(v.hour)}:${pad(v.minute)}:${pad(v.second)}${frac}`;
}

function isTemporalDateLike(value: unknown): value is TemporalDateLike {
  return (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime
  );
}

function quoteScalar(this: ArelConnection, value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? this.quotedTrue() : this.quotedFalse();
  if (ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return this.quotedBinary(bytes);
  }
  if (value instanceof Temporal.PlainTime) return `'${quotedTime(value).replace(/'/g, "''")}'`;
  if (isTemporalDateLike(value)) return `'${quotedDate(value).replace(/'/g, "''")}'`;
  // boundary: the JS Date is matched only to refuse it, per #939.
  if (value instanceof Date) {
    throw new TypeError(
      "quote: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    const hasCustomToString =
      proto === Object.prototype && value.toString !== Object.prototype.toString;
    if ((proto === Object.prototype || proto === null) && !hasCustomToString) {
      let json: string | undefined;
      try {
        json = JSON.stringify(value);
      } catch {
        json = undefined;
      }
      if (json !== undefined) return `'${json.replace(/'/g, "''")}'`;
    }
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

export const mysqlDefaultQuoter: ArelConnection = {
  quoteTableName(name: unknown): string {
    return toS(name)
      .split(".")
      .map((p) => "`" + p.replace(/`/g, "``") + "`")
      .join(".");
  },

  quoteColumnName(name: unknown): string {
    return "`" + toS(name).replace(/`/g, "``") + "`";
  },

  quoteString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  },

  quote: quoteScalar,

  quotedBinary(value: unknown): string {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(
            String(value)
              .split("")
              .map((c) => c.charCodeAt(0)),
          );
    return `x'${Buffer.from(bytes).toString("hex")}'`;
  },

  quotedTrue(): string {
    return "TRUE";
  },
  quotedFalse(): string {
    return "FALSE";
  },

  unquotedTrue(): number {
    return 1;
  },
  unquotedFalse(): number {
    return 0;
  },

  castBoundValue(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (value === true) return "1";
    if (value === false) return "0";
    return value;
  },

  sanitizeAsSqlComment: defaultSanitizeAsSqlComment,
};

export const defaultQuoter: ArelConnection = {
  quoteTableName(name: unknown): string {
    return `"${toS(name).replace(/"/g, '""').replace(/\./g, '"."')}"`;
  },

  quoteColumnName(name: unknown): string {
    return `"${toS(name).replace(/"/g, '""')}"`;
  },

  quoteString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  },

  quote: quoteScalar,

  quotedBinary(value: unknown): string {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(
            String(value)
              .split("")
              .map((c) => c.charCodeAt(0)),
          );
    return `'${Buffer.from(bytes).toString("hex")}'`;
  },

  quotedTrue(): string {
    return "TRUE";
  },
  quotedFalse(): string {
    return "FALSE";
  },

  unquotedTrue(): boolean {
    return true;
  },
  unquotedFalse(): boolean {
    return false;
  },

  castBoundValue(value: unknown): unknown {
    return value;
  },

  sanitizeAsSqlComment: defaultSanitizeAsSqlComment,
};

export const postgresqlDefaultQuoter: ArelConnection = {
  ...defaultQuoter,

  quote(value: unknown): string {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `'${String(value)}'`;
    }
    return quoteScalar.call(this, value);
  },
};
