import { ValueType } from "@blazetrails/activemodel";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Range } from "@blazetrails/ruby-compat";

export interface RangeSubtype {
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize(value: unknown): unknown;
  /** @internal */
  infinity?(options?: { negative?: boolean }): unknown;
  userInputInTimeZone?(value: unknown): unknown;
}

export class RangeType extends ValueType<Range<unknown>> {
  readonly subtype: RangeSubtype;
  readonly #type: string;

  constructor(subtype: RangeSubtype, type: string = "range") {
    super();
    this.subtype = subtype;
    this.#type = type;
  }

  override type(): string {
    return this.#type;
  }

  userInputInTimeZone(value: unknown): unknown {
    return this.subtype.userInputInTimeZone!(value);
  }

  override typeCastForSchema(value: unknown): string {
    return inspect(value).replace(/Infinity/g, "::Float::INFINITY");
  }

  castValue(value: unknown): Range<unknown> | null {
    if (value == null || value === "empty" || value === "") return null;
    if (typeof value !== "string") return value as Range<unknown> | null;

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

  cast(value: unknown): Range<unknown> | null {
    return this.castValue(value);
  }

  override deserialize(value: unknown): Range<unknown> | null {
    return this.castValue(value);
  }

  override serialize(value: unknown): unknown {
    if (!(value instanceof Range)) return value;
    const from = this.typeCastSingleForDatabase(value.begin);
    const to = this.typeCastSingleForDatabase(value.end);
    return new Range(from, to, value.excludeEnd);
  }

  override map(value: Range<unknown>, block: (value: unknown) => unknown): Range<unknown> {
    const newBegin = block(value.begin);
    const newEnd = block(value.end);
    return new Range(newBegin, newEnd, value.excludeEnd);
  }

  override isForceEquality(value: unknown): boolean {
    return value instanceof Range;
  }

  private typeCastSingle(value: unknown): unknown {
    return isInfinity(value) ? value : this.subtype.deserialize(value);
  }

  private typeCastSingleForDatabase(value: unknown): unknown {
    return isInfinity(value) ? value : this.subtype.serialize(this.subtype.cast(value));
  }

  /** @missingRailsCall split — PERMANENT */
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
          : this.unquote(from),
      to: to === "" || to === "infinity" ? this.infinity() : this.unquote(to),
      excludeStart: value.startsWith("("),
      excludeEnd: value.endsWith(")"),
    };
  }

  private infinity({ negative = false }: { negative?: boolean } = {}): unknown {
    if (this.subtype.infinity) {
      return this.subtype.infinity({ negative });
    } else if (negative) {
      return -Infinity;
    } else {
      return Infinity;
    }
  }

  /** @internal */
  private unquote(value: string): string {
    return unquoteRangeBound(value);
  }
}

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

export function unquoteRangeBound(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"').replace(/\\\\/g, "\\");
  }
  return value;
}

/** @internal */
function sanitizeBounds(from: unknown, to: unknown): [unknown, unknown] {
  return [
    from === -Infinity && !infiniteFloatRangeCovers(to) ? null : from,
    to === Infinity && !infiniteFloatRangeCovers(from) ? null : to,
  ];
}

/** @internal */
function isInfinity(value: unknown): boolean {
  return value === Infinity || value === -Infinity;
}

function infiniteFloatRangeCovers(value: unknown): boolean {
  return typeof value === "number" && !Number.isNaN(value);
}

function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (value instanceof RubyTime) return value.toS();
  if (value instanceof Temporal.Instant) return value.toString();
  if (value instanceof Temporal.PlainDateTime) return value.toString();
  if (value instanceof Temporal.PlainDate) return value.toString();
  if (value instanceof Temporal.PlainTime) return value.toString();
  // boundary: explicit Date rejection so legacy callers get a clear error.
  if (value instanceof Date)
    throw new TypeError("Range inspect: JS Date is not accepted — use a Temporal type");
  return String(value);
}
