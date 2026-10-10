import { ValueType } from "@blazetrails/activemodel";
import {
  ArgumentError,
  Range,
  rbEqual,
  rbFSend,
  rbInspect,
  rbObjRespondTo,
  registerConstant,
  stringSplit,
} from "@blazetrails/ruby-compat";

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
  private readonly _type: string;

  override type(): string {
    return this._type;
  }

  userInputInTimeZone(value: unknown): unknown {
    return this.subtype.userInputInTimeZone!(value);
  }

  constructor(subtype: RangeSubtype, type: string = "range") {
    super();
    this.subtype = subtype;
    this._type = type;
  }

  override typeCastForSchema(value: unknown): string {
    return rbInspect(value).replace(/Infinity/g, "::Float::INFINITY");
  }

  castValue(value: unknown): Range<unknown> | null {
    if (value == null || value === "empty" || value === "") return null;
    if (typeof value !== "string") return value as Range<unknown> | null;

    const extracted = this.extractBounds(value);
    const from = this.typeCastSingle(extracted.from);
    const to = this.typeCastSingle(extracted.to);

    if (!this.isInfinity(from) && extracted.excludeStart) {
      throw new ArgumentError(
        `The Ruby Range object does not support excluding the beginning of a Range. (unsupported value: '${value}')`,
      );
    }

    const [begin, end] = this.sanitizeBounds(from, to);
    return new Range(begin, end, extracted.excludeEnd);
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
    return this.isInfinity(value) ? value : this.subtype.deserialize(value);
  }

  private typeCastSingleForDatabase(value: unknown): unknown {
    return this.isInfinity(value) ? value : this.subtype.serialize(this.subtype.cast(value));
  }

  private extractBounds(value: string): {
    from: unknown;
    to: unknown;
    excludeStart: boolean;
    excludeEnd: boolean;
  } {
    const [from, to] = stringSplit(value.slice(1, -1), ",", 2);
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

  static readonly INFINITE_FLOAT_RANGE = new Range<unknown>(-Infinity, Infinity);

  /** @internal */
  private sanitizeBounds(from: unknown, to: unknown): [unknown, unknown] {
    return [
      rbEqual(from, -Infinity) && !RangeType.INFINITE_FLOAT_RANGE.cover(to) ? null : from,
      rbEqual(to, Infinity) && !RangeType.INFINITE_FLOAT_RANGE.cover(from) ? null : to,
    ];
  }

  /** @internal */
  private unquote(value: string): string {
    if (value.startsWith('"') && value.endsWith('"')) {
      let unquotedValue = value.slice(1, -1);
      unquotedValue = unquotedValue.replaceAll('""', '"');
      unquotedValue = unquotedValue.replaceAll("\\\\", "\\");
      return unquotedValue;
    } else {
      return value;
    }
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
  private isInfinity(value: unknown): 1 | -1 | null | false {
    return rbObjRespondTo(value, "isInfinite") && (rbFSend(value, "isInfinite") as 1 | -1 | null);
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range", RangeType);
