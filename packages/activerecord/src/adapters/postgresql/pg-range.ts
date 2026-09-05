import {
  findRangeSeparator,
  unquoteRangeBound,
} from "../../connection-adapters/postgresql/oid/range.js";
import { Range } from "@blazetrails/ruby-compat";

export type SubtypeCast = (value: string) => unknown;

/** @noRailsEquivalent CONVERGEABLE converge-pg-range-helper-onto-oid-range-cast-value */
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
