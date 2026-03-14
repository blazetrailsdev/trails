/**
 * Base Type class — all types extend this.
 *
 * Mirrors: ActiveModel::Type::Value
 */
export abstract class Type<T = unknown> {
  abstract readonly name: string;

  /**
   * Cast a raw value to this type.
   */
  abstract cast(value: unknown): T | null;

  /**
   * Deserialize from a database/storage representation.
   * Default: delegates to cast.
   */
  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  /**
   * Serialize to a storage representation.
   * Default: returns the cast value.
   */
  serialize(value: unknown): unknown {
    return this.cast(value);
  }
}

export class StringType extends Type<string> {
  readonly name = "string";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
  }
}

export class IntegerType extends Type<number> {
  readonly name = "integer";

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      if (isNaN(value)) return null;
      return Math.trunc(value);
    }
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
  }
}

export class FloatType extends Type<number> {
  readonly name = "float";

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? null : parsed;
  }
}

export class BooleanType extends Type<boolean> {
  readonly name = "boolean";

  private static readonly TRUE_VALUES = new Set([
    true,
    1,
    "1",
    "t",
    "T",
    "true",
    "TRUE",
    "on",
    "ON",
    "yes",
    "YES",
  ]);
  private static readonly FALSE_VALUES = new Set([
    false,
    0,
    "0",
    "f",
    "F",
    "false",
    "FALSE",
    "off",
    "OFF",
    "no",
    "NO",
  ]);

  cast(value: unknown): boolean | null {
    if (value === null || value === undefined) return null;
    if (BooleanType.TRUE_VALUES.has(value as any)) return true;
    if (BooleanType.FALSE_VALUES.has(value as any)) return false;
    return null;
  }
}

export class DateType extends Type<Date> {
  readonly name = "date";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }
}

export class DateTimeType extends Type<Date> {
  readonly name = "datetime";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }
}

export class DecimalType extends Type<string> {
  readonly name = "decimal";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    return isNaN(n) ? null : n.toString();
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UuidType extends Type<string> {
  readonly name = "uuid";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value).toLowerCase();
    if (!UUID_REGEX.test(str)) return null;
    return str;
  }
}

export class BigIntegerType extends Type<bigint> {
  readonly name = "big_integer";

  cast(value: unknown): bigint | null {
    if (value === null || value === undefined) return null;
    try {
      return BigInt(typeof value === "string" ? value.trim() : (value as any));
    } catch {
      return null;
    }
  }

  serialize(value: unknown): string | null {
    const cast = this.cast(value);
    return cast !== null ? cast.toString() : null;
  }
}

export class ImmutableStringType extends Type<string> {
  readonly name = "immutable_string";

  cast(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const str = String(value);
    return Object.freeze(str) as string;
  }
}

export class ValueType extends Type<unknown> {
  readonly name = "value";

  cast(value: unknown): unknown {
    return value;
  }

  equals(other: Type): boolean {
    return this.constructor === other.constructor;
  }
}

const textEncoder = new TextEncoder();

export class BinaryType extends Type<Uint8Array> {
  readonly name = "binary";

  cast(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Uint8Array) return value;
    return textEncoder.encode(String(value));
  }

  serialize(value: unknown): Uint8Array | null {
    return this.cast(value);
  }
}

export class TimeType extends Type<Date> {
  readonly name = "time";

  cast(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (value === "" || (typeof value === "string" && value.trim() === "")) return null;
    if (value instanceof Date) return value;
    const str = String(value);
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
}

export class JsonType extends Type<unknown> {
  readonly name = "json";

  cast(value: unknown): unknown | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }
}
