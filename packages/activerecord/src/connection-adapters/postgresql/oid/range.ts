/**
 * PostgreSQL range support.
 *
 * Rails has two distinct classes:
 *
 *   - Ruby's core `::Range` — the query value with primitive begin/end bounds,
 *     used everywhere in ActiveRecord (predicate builders, `where(x: 1..10)`,
 *     etc).
 *   - `ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range` — a
 *     `Type::Value` that owns a subtype and a type name, and whose
 *     `cast_value`/`serialize`/etc. return `::Range` instances.
 *
 * TypeScript has no `::Range` analog, so we expose:
 *
 *   - `Range` — query value class (matches core Ruby `::Range`).
 *   - `RangeType` — the Type::Value wrapper (matches `OID::Range`). It owns
 *     the subtype and emits `Range` instances from `castValue`/`serialize`.
 */

import { ValueType } from "@blazetrails/activemodel";

export class Range {
  readonly begin: unknown;
  readonly end: unknown;
  readonly excludeEnd: boolean;

  constructor(begin: unknown, end?: unknown, excludeEnd: boolean = false) {
    this.begin = begin;
    this.end = end;
    this.excludeEnd = excludeEnd;
  }
}

export interface RangeSubtype {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize(value: unknown): unknown;
  infinity?(options?: { negative?: boolean }): unknown;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range.
 */
export class RangeType extends ValueType<Range> {
  readonly name: string;
  readonly subtype: RangeSubtype;

  constructor(subtype: RangeSubtype, type: string = "range") {
    super();
    this.subtype = subtype;
    this.name = type;
  }

  override type(): string {
    return this.name;
  }

  override typeCastForSchema(value: unknown): string {
    return inspect(value).replace(/Infinity/g, "::Float::INFINITY");
  }

  castValue(value: unknown): Range | null {
    if (value == null || value === "empty" || value === "") return null;
    // Rails' cast_value passes non-String values through unchanged
    // (`return value unless value.is_a?(::String)`). The cast is generic in
    // Ruby so this just trusts the caller. In TS we keep the Rails semantic
    // but acknowledge the Range | null return type is optimistic for non-
    // string inputs — callers shouldn't pass garbage here.
    if (typeof value !== "string") return value as Range | null;

    const extracted = this.extractBounds(value);
    const from = this.typeCastSingle(extracted.from);
    const to = this.typeCastSingle(extracted.to);

    if (!isInfinity(from) && extracted.excludeStart) {
      throw new Error(
        `The Ruby Range object does not support excluding the beginning of a Range. (unsupported value: '${value}')`,
      );
    }

    const [begin, end] = sanitizeBounds(from, to);
    return new Range(begin, end, extracted.excludeEnd);
  }

  cast(value: unknown): Range | null {
    return this.castValue(value);
  }

  override deserialize(value: unknown): Range | null {
    return this.castValue(value);
  }

  override serialize(value: unknown): unknown {
    if (!(value instanceof Range)) return value;
    return new Range(
      this.typeCastSingleForDatabase(value.begin),
      this.typeCastSingleForDatabase(value.end),
      value.excludeEnd,
    );
  }

  override map(value: Range | null, block?: (value: unknown) => unknown): Range | null {
    if (value == null || !block) return value;
    return new Range(block(value.begin), block(value.end), value.excludeEnd);
  }

  override isForceEquality(value: unknown): boolean {
    return value instanceof Range;
  }

  private typeCastSingle(value: unknown): unknown {
    // Rails calls @subtype.deserialize directly — no cast fallback. If a
    // subtype doesn't implement deserialize, surface that as a failure
    // rather than silently routing through cast and producing a different
    // shape than Rails would.
    return isInfinity(value) ? value : this.subtype.deserialize(value);
  }

  private typeCastSingleForDatabase(value: unknown): unknown {
    return isInfinity(value) ? value : this.subtype.serialize(this.subtype.cast(value));
  }

  private extractBounds(value: string): {
    from: unknown;
    to: unknown;
    excludeStart: boolean;
    excludeEnd: boolean;
  } {
    const fromTo = value.slice(1, -1);
    const separator = findRangeSeparator(fromTo);
    const from = fromTo.slice(0, separator);
    const to = fromTo.slice(separator + 1);

    return {
      from:
        from === "" || from === "-infinity"
          ? this.infinity({ negative: true })
          : unquoteRangeBound(from),
      to: to === "" || to === "infinity" ? this.infinity() : unquoteRangeBound(to),
      excludeStart: value.startsWith("("),
      excludeEnd: value.endsWith(")"),
    };
  }

  private infinity(options?: { negative?: boolean }): unknown {
    return this.subtype.infinity?.(options) ?? (options?.negative ? -Infinity : Infinity);
  }
}

/**
 * Split a range-literal's inner string (without surrounding `[` / `)`) at
 * the top-level comma, skipping commas inside double-quoted bounds. PG
 * range output always uses `""` for an escaped quote, so that's what we
 * track here — matches Rails' `extract_bounds`.
 */
export function findRangeSeparator(value: string): number {
  let inQuotes = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '"') {
      if (inQuotes && value[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      return i;
    }
  }
  return value.length;
}

/**
 * Unquote a range-bound value. PG emits `""` for literal `"` and `\\` for
 * literal `\` inside double-quoted bounds. Mirrors Rails' `unquote`.
 */
export function unquoteRangeBound(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

function sanitizeBounds(from: unknown, to: unknown): [unknown, unknown] {
  return [
    from === -Infinity && !infiniteFloatRangeCovers(to) ? null : from,
    to === Infinity && !infiniteFloatRangeCovers(from) ? null : to,
  ];
}

function isInfinity(value: unknown): boolean {
  return value === Infinity || value === -Infinity;
}

function infiniteFloatRangeCovers(value: unknown): boolean {
  return typeof value === "number" && !Number.isNaN(value);
}

/**
 * Approximates Ruby's Object#inspect for primitives so schema dumps match
 * Rails output: strings are double-quoted, dates are inspected, numbers/
 * booleans/null/undefined render bare.
 */
function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
