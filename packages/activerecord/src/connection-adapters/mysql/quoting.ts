/**
 * MySQL quoting — MySQL-specific value and identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting (module)
 *
 * In Rails, Quoting is a module mixed into AbstractMysqlAdapter.
 * Here we export standalone functions, matching the pattern used by
 * the PostgreSQL and SQLite3 adapters.
 *
 * @boundary-file: SQL value quoting branches on `instanceof Date` alongside
 *   Temporal types; legacy Date values from custom-typed columns hit a
 *   typed-error path that mirrors the abstract dispatcher.
 */

import {
  typeCast as abstractTypeCast,
  toBytes,
  type QuotingDispatchHost,
} from "../abstract/quoting.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational, rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { BigDecimal, TimeWithZone } from "@blazetrails/activesupport";
import { _Base } from "../../base-slot.js";
import { BinaryData } from "@blazetrails/activemodel";

export function unquotedTrue(): number {
  return 1;
}

export function unquotedFalse(): number {
  return 0;
}

const QUOTED_COLUMN_NAMES = new Map<unknown, string>();
const QUOTED_TABLE_NAMES = new Map<unknown, string>();

export function quoteTableName(name: unknown): string {
  let quoted = QUOTED_TABLE_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `\`${toS(name).replace(/`/g, "``").replace(/\./g, "`.`")}\``;
    QUOTED_TABLE_NAMES.set(name, quoted);
  }
  return quoted;
}

export function quoteColumnName(name: unknown): string {
  let quoted = QUOTED_COLUMN_NAMES.get(name);
  if (quoted === undefined) {
    quoted = `\`${toS(name).replace(/`/g, "``")}\``;
    QUOTED_COLUMN_NAMES.set(name, quoted);
  }
  return quoted;
}

export interface EscapeState {
  noBackslashEscapes: boolean;
}

export function quotedBinary(
  value: Buffer | Uint8Array | ArrayBuffer | string | BinaryData,
): string {
  const bytes = toBytes(value);
  if (bytes) {
    return `x'${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex")}'`;
  }
  if (typeof value === "string") return `x'${Buffer.from(value, "binary").toString("hex")}'`;
  throw new TypeError(
    `quotedBinary expects a Uint8Array, ArrayBuffer, Buffer, string, or BinaryData; got ${
      value === null ? "null" : typeof value
    }`,
  );
}

export function unquoteIdentifier(identifier: string | null | undefined): string | null {
  if (identifier && identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier.slice(1, -1).replace(/``/g, "`");
  }
  return identifier ?? null;
}

export function castBoundValue(value: unknown): unknown {
  if (value instanceof Rational) {
    const f = value.toF();
    return Number.isInteger(f) ? `${f}.0` : String(f);
  }
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof BigDecimal) return value.toString("E");
  if (value === true) return "1";
  if (value === false) return "0";
  return value;
}

export function columnNameMatcher(): RegExp {
  const id =
    String.raw`(?:\d+|` +
    "`" +
    String.raw`[^` +
    "`" +
    String.raw`]*` +
    "`" +
    String.raw`|"[^"]*"|\w+)`;
  const col = String.raw`(?:(?:${id}\.){0,2})${id}`;
  const fnCall2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
  const fnCall1 = String.raw`\w+\(\s*(?:\*|${col}|${fnCall2})?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall1})`;
  const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
  return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
}

export function columnNameWithOrderMatcher(): RegExp {
  const id =
    String.raw`(?:\d+|` +
    "`" +
    String.raw`[^` +
    "`" +
    String.raw`]*` +
    "`" +
    String.raw`|"[^"]*"|\w+)`;
  const col = String.raw`(?:(?:${id}\.){0,2})${id}`;
  const fnCall2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
  const fnCall1 = String.raw`\w+\(\s*(?:\*|${col}|${fnCall2})?\s*\)`;
  const expr = String.raw`(?:${col}|${fnCall1})`;
  const collate = String.raw`(?:\s+COLLATE\s+(?:\w+|"\w+"))?`;
  const dir = String.raw`(?:\s+ASC|\s+DESC)?`;
  const nulls = String.raw`(?:\s+NULLS\s+(?:FIRST|LAST))?`;
  const ordered = String.raw`${expr}${collate}${dir}${nulls}`;
  return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
}

export function typeCast(this: QuotingDispatchHost, value: unknown): unknown {
  if (value instanceof TimeWithZone) {
    if (_Base!.defaultTimezone === "utc") {
      return value.getutc();
    } else {
      return value.getlocal();
    }
  }
  if (value instanceof RubyTime) {
    if (_Base!.defaultTimezone === "utc") {
      return value.isUtc() ? value : value.getutc();
    } else {
      return value.isUtc() ? value.getlocal() : value;
    }
  }
  if (value instanceof Temporal.PlainDate) {
    return value;
  }
  return abstractTypeCast.call(this, value);
}
