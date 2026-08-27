import type { ArelConnection } from "../visitors/connection.js";
import type { ArelEngine } from "../nodes/node.js";
import { ToSql } from "../visitors/to-sql.js";
import { defaultQuoter, mysqlDefaultQuoter, postgresqlDefaultQuoter } from "./default-quoter.js";
import { Temporal } from "@blazetrails/date";

/** @internal */
export const testConnection: ArelConnection = defaultQuoter;

/** @internal */
export const mysqlTestConnection: ArelConnection = mysqlDefaultQuoter;

/** @internal */
export const postgresqlTestConnection: ArelConnection = postgresqlDefaultQuoter;

function unreachableOnFakeRecord(name: string): () => never {
  return () => {
    throw new Error(
      `${name} is not defined on FakeRecord: Rails' Arel visitor never calls it on this double. ` +
        `Reaching it means the visitor diverged from Rails — fix the visitor, not this double.`,
    );
  };
}

function rubyTimeToS(zdt: Temporal.ZonedDateTime): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  const offsetMinutes = Math.trunc(zdt.offsetNanoseconds / 60_000_000_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${p(Math.floor(abs / 60))}${p(abs % 60)}`;
  const year = `${zdt.year < 0 ? "-" : ""}${String(Math.abs(zdt.year)).padStart(4, "0")}`;
  return `${year}-${p(zdt.month)}-${p(zdt.day)} ${p(zdt.hour)}:${p(zdt.minute)}:${p(zdt.second)} ${offset}`;
}

/** @internal */
export const fakeRecordConnection: ArelConnection = {
  quoteString: unreachableOnFakeRecord("quoteString"),
  quotedBinary: unreachableOnFakeRecord("quotedBinary"),
  quotedTrue: unreachableOnFakeRecord("quotedTrue"),
  quotedFalse: unreachableOnFakeRecord("quotedFalse"),
  unquotedTrue: unreachableOnFakeRecord("unquotedTrue"),
  unquotedFalse: unreachableOnFakeRecord("unquotedFalse"),

  quoteTableName(name: string): string {
    return `"${name}"`;
  },

  quoteColumnName(name: string): string {
    return `"${name}"`;
  },

  quote(thing: unknown): string {
    if (thing === true) return "'t'";
    if (thing === false) return "'f'";
    if (thing === null || thing === undefined) return "NULL";
    if (typeof thing === "number" || typeof thing === "bigint") return String(thing);
    if (thing instanceof Temporal.PlainDate) {
      return `'${String(thing.year).padStart(4, "0")}-${String(thing.month).padStart(2, "0")}-${String(thing.day).padStart(2, "0")}'`;
    }
    if (thing instanceof Temporal.PlainDateTime) {
      const p = (n: number): string => String(n).padStart(2, "0");
      return `'${String(thing.year).padStart(4, "0")}-${p(thing.month)}-${p(thing.day)} ${p(thing.hour)}:${p(thing.minute)}:${p(thing.second)}'`;
    }
    if (thing instanceof Temporal.Instant) {
      return `'${rubyTimeToS(thing.toZonedDateTimeISO("UTC"))}'`;
    }
    if (thing instanceof Temporal.ZonedDateTime) {
      return `'${rubyTimeToS(thing)}'`;
    }
    return `'${String(thing).replace(/'/g, "\\'")}'`;
  },

  sanitizeAsSqlComment(value: string): string {
    return value;
  },

  castBoundValue(value: unknown): unknown {
    return value;
  },
};

/** @internal */
export const fakeRecordEngine: ArelEngine = {
  connection: { visitor: new ToSql(fakeRecordConnection) },
};
