/**
 * PostgreSQL array type — casts between PG array literals and JS arrays.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Array
 * (Rails: `class Array < Type::Value; include Helpers::Mutable`).
 */

import { Type } from "@blazetrails/activemodel";

function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
  } catch {
    return String(value);
  }
}

export interface ArraySubtype {
  readonly type?: string | (() => string);
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize?(value: unknown): unknown;
  typeCastForSchema?(value: unknown): string;
  map?(value: unknown, block?: (value: unknown) => unknown): unknown;
}

export class Array extends Type<unknown> {
  readonly name: string = "array";
  readonly subtype: ArraySubtype;
  readonly delimiter: string;

  constructor(subtype: ArraySubtype, delimiter: string = ",") {
    super();
    this.subtype = subtype;
    this.delimiter = delimiter;
  }

  /**
   * Rails: `delegate :type, ... to: :subtype`. Array's type() returns
   * the subtype's type — e.g. an int4 array reports :integer.
   */
  override type(): string {
    const subtypeType = this.subtype.type;
    if (typeof subtypeType === "function") return subtypeType.call(this.subtype);
    if (typeof subtypeType === "string") return subtypeType;
    return "array";
  }

  /** Rails' Helpers::Mutable. */
  override isMutable(): boolean {
    return true;
  }

  cast(value: unknown): unknown {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) return this.typeCastArray(value, "cast");
    if (typeof value === "string") return this.parseArray(value);
    return this.typeCastArray(value, "cast");
  }

  override serialize(value: unknown): unknown {
    if (value == null) return null;
    if (!globalThis.Array.isArray(value)) return value;
    return new Data(this, this.typeCastArray(value, "serialize") as unknown[]);
  }

  override deserialize(value: unknown): unknown {
    if (value == null) return null;
    if (value instanceof Data) return this.typeCastArray(value.values, "deserialize") as unknown[];
    if (typeof value === "string") return this.parseArray(value, "deserialize");
    // Divergence: Rails' deserialize only sees strings (PG::TextDecoder is run
    // upstream). node-pg can return already-decoded JS arrays, so route them
    // through the subtype here the same way cast() does.
    if (globalThis.Array.isArray(value))
      return this.typeCastArray(value, "deserialize") as unknown[];
    return value;
  }

  private parseArray(str: string, method: "cast" | "deserialize" = "cast"): unknown[] {
    const trimmed = str.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
    const inner = trimmed.slice(1, -1);
    if (inner === "") return [];

    const elements: unknown[] = [];
    let i = 0;

    while (i < inner.length) {
      if (inner[i] === '"') {
        i++;
        let val = "";
        while (i < inner.length && inner[i] !== '"') {
          if (inner[i] === "\\" && i + 1 < inner.length) {
            i++;
            val += inner[i];
          } else {
            val += inner[i];
          }
          i++;
        }
        i++; // closing quote
        elements.push(this.castElement(val, method));
      } else if (
        inner.substring(i, i + 4).toUpperCase() === "NULL" &&
        (i + 4 >= inner.length || inner[i + 4] === this.delimiter || inner[i + 4] === "}")
      ) {
        elements.push(null);
        i += 4;
      } else if (inner[i] === "{") {
        let depth = 1;
        const start = i;
        i++;
        while (i < inner.length && depth > 0) {
          if (inner[i] === "{") depth++;
          if (inner[i] === "}") depth--;
          i++;
        }
        elements.push(this.parseArray(inner.substring(start, i), method));
      } else {
        let val = "";
        while (i < inner.length && inner[i] !== this.delimiter) {
          val += inner[i];
          i++;
        }
        elements.push(this.castElement(val, method));
      }
      if (i < inner.length && inner[i] === this.delimiter) i++;
    }

    return elements;
  }

  private castElement(value: unknown, method: "cast" | "deserialize"): unknown {
    if (method === "deserialize")
      return this.subtype.deserialize?.(value) ?? this.subtype.cast(value);
    return this.subtype.cast(value);
  }

  encode(values: readonly unknown[]): string {
    const items = values.map((value) => {
      if (value == null) return "NULL";
      if (globalThis.Array.isArray(value)) return this.encode(value);

      const str = String(value);
      if (
        str === "" ||
        str.toUpperCase() === "NULL" ||
        str.includes(this.delimiter) ||
        str.includes('"') ||
        str.includes("\\") ||
        str.includes("{") ||
        str.includes("}") ||
        /\s/.test(str)
      ) {
        return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return str;
    });
    return `{${items.join(this.delimiter)}}`;
  }

  private formatValueForSchema(value: unknown): string {
    const typeCastForSchema = this.subtype.typeCastForSchema;
    if (typeCastForSchema) return typeCastForSchema(value);
    if (typeof value === "bigint") return String(value);
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }

  override typeCastForSchema(value: unknown): string {
    if (!globalThis.Array.isArray(value)) return this.formatValueForSchema(value);
    return `[${value.map((item) => this.formatValueForSchema(item)).join(", ")}]`;
  }

  map(value: unknown, block?: (value: unknown) => unknown): unknown {
    if (globalThis.Array.isArray(value)) return block ? value.map(block) : value;
    return this.subtype.map ? this.subtype.map(value, block) : block ? block(value) : value;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = this.deserialize(rawOldValue);
    return stableStringify(oldValue) !== stableStringify(newValue);
  }

  override isForceEquality(value: unknown): boolean {
    return globalThis.Array.isArray(value);
  }

  private typeCastArray(value: unknown, method: "cast" | "serialize" | "deserialize"): unknown {
    if (globalThis.Array.isArray(value)) {
      return value.map((item) => this.typeCastArray(item, method));
    }

    if (method === "deserialize")
      return this.subtype.deserialize?.(value) ?? this.subtype.cast(value);
    if (method === "cast") return this.subtype.cast(value);
    return this.subtype.serialize(value);
  }
}

export class Data {
  readonly encoder: Array;
  readonly values: unknown[];

  constructor(encoder: Array, values: unknown[]) {
    this.encoder = encoder;
    this.values = values;
  }

  toString(): string {
    return this.encoder.encode(this.values);
  }
}
