import {
  findRangeSeparator,
  unquoteRangeBound,
} from "../../connection-adapters/postgresql/oid/range.js";
import { Range } from "@blazetrails/activesupport";

export type SubtypeCast = (value: string) => unknown;

export function parseRange(input: string, subtype?: SubtypeCast): Range<unknown> | null {
  if (!input || input === "empty") return null;

  const excludeBegin = input[0] === "(";
  const excludeEnd = input[input.length - 1] === ")";

  const inner = input.slice(1, -1);
  const commaIdx = findRangeSeparator(inner);

  let rawBegin: string | null = inner.slice(0, commaIdx).trim();
  let rawEnd: string | null = inner.slice(commaIdx + 1).trim();

  if (rawBegin === "" || rawBegin === "-infinity") rawBegin = null;
  if (rawEnd === "" || rawEnd === "infinity") rawEnd = null;

  rawBegin = rawBegin && unquoteRangeBound(rawBegin);
  rawEnd = rawEnd && unquoteRangeBound(rawEnd);

  if (excludeBegin && rawBegin !== null) {
    throw new Error(
      "The Range object does not support excluding the beginning of a Range. " +
        `(unsupported value: '${input}')`,
    );
  }

  const castBegin = rawBegin !== null && subtype ? subtype(rawBegin) : rawBegin;
  const castEnd = rawEnd !== null && subtype ? subtype(rawEnd) : rawEnd;

  return new Range(castBegin, castEnd, excludeEnd);
}

export type SubtypeSerialize = (value: unknown) => string;

export function serializeRange(range: Range<unknown>, subtype?: SubtypeSerialize): string {
  const serializeBound = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = subtype ? subtype(v) : String(v);
    return quoteRangeBound(s);
  };
  const endBracket = range.excludeEnd ? ")" : "]";
  return `[${serializeBound(range.begin)},${serializeBound(range.end)}${endBracket}`;
}

function quoteRangeBound(value: string): string {
  if (/[",\\\s[\]()]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '""')}"`;
  }
  return value;
}
