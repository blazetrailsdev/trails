import { ValueType } from "@blazetrails/activemodel";
import { rbEqual } from "@blazetrails/ruby-compat";

const STRUCTURAL_CHARS = /[{}"\\ \t\n\r\v\f]/;
const NULL_LITERAL = /^null$/i;

function encodeArrayElement(text: string | null, delimiter: string): string {
  if (text === null) return "NULL";
  if (
    text === "" ||
    NULL_LITERAL.test(text) ||
    text.includes(delimiter) ||
    STRUCTURAL_CHARS.test(text)
  ) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return text;
}

/** @noRailsEquivalent PERMANENT */
export class PgTextEncoderArray {
  readonly name: string;
  readonly delimiter: string;

  constructor({ name, delimiter }: { name: string; delimiter: string }) {
    this.name = name;
    this.delimiter = delimiter;
  }

  encode(values: readonly unknown[]): string {
    const items = values.map((value) => {
      if (value == null) return encodeArrayElement(null, this.delimiter);
      if (globalThis.Array.isArray(value)) return this.encode(value);
      return encodeArrayElement(String(value), this.delimiter);
    });
    return `{${items.join(this.delimiter)}}`;
  }
}

/** @noRailsEquivalent PERMANENT */
export class PgTextDecoderArray {
  readonly name: string;
  readonly delimiter: string;

  constructor({ name, delimiter }: { name: string; delimiter: string }) {
    this.name = name;
    this.delimiter = delimiter;
  }

  decode(str: string): unknown[] {
    const trimmed = str.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      // eslint-disable-next-line blazetrails/rails-error-parity
      throw new TypeError(`malformed array literal: "${str}"`);
    }
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
        i++;
        elements.push(val);
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
        elements.push(this.decode(inner.substring(start, i)));
      } else {
        let val = "";
        while (i < inner.length && inner[i] !== this.delimiter) {
          val += inner[i];
          i++;
        }
        elements.push(val);
      }
      if (i < inner.length && inner[i] === this.delimiter) i++;
    }

    return elements;
  }
}

export interface ArraySubtype {
  readonly type?: string | (() => string | undefined);
  readonly limit?: number;
  readonly precision?: number;
  readonly scale?: number;
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize?(value: unknown): unknown;
  typeCastForSchema?(value: unknown): string;
  map?(value: unknown, block: (value: unknown) => unknown): unknown;
  userInputInTimeZone?(value: unknown): unknown;
}

export class Array extends ValueType<unknown> {
  readonly subtype: ArraySubtype;
  readonly delimiter: string;
  private readonly pgEncoder: PgTextEncoderArray;
  private readonly pgDecoder: PgTextDecoderArray;

  constructor(subtype: ArraySubtype, delimiter: string = ",") {
    super();
    this.subtype = subtype;
    this.delimiter = delimiter;

    this.pgEncoder = new PgTextEncoderArray({
      name: `${this.type() ?? ""}[]`,
      delimiter: delimiter,
    });
    this.pgDecoder = new PgTextDecoderArray({
      name: `${this.type() ?? ""}[]`,
      delimiter: delimiter,
    });
  }

  override get limit(): number | undefined {
    return this.subtype.limit;
  }

  override get precision(): number | undefined {
    return this.subtype.precision;
  }

  override get scale(): number | undefined {
    return this.subtype.scale;
  }

  userInputInTimeZone(value: unknown): unknown {
    return this.subtype.userInputInTimeZone!(value);
  }

  override type(): string | undefined {
    const subtypeType = this.subtype.type;
    if (typeof subtypeType === "function") return subtypeType.call(this.subtype);
    return subtypeType;
  }

  override isMutable(): boolean {
    return true;
  }

  cast(value: unknown): unknown {
    if (typeof value === "string") {
      try {
        value = this.pgDecoder.decode(value);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        value = [];
      }
    }
    return this.typeCastArray(value, "cast");
  }

  override serialize(value: unknown): unknown {
    if (globalThis.Array.isArray(value)) {
      const castedValues = this.typeCastArray(value, "serialize") as unknown[];
      return new Data(this.pgEncoder, castedValues);
    }
    return super.serialize(value);
  }

  override deserialize(value: unknown): unknown {
    if (typeof value === "string") {
      return this.typeCastArray(this.pgDecoder.decode(value), "deserialize");
    }
    if (value instanceof Data) return this.typeCastArray(value.values, "deserialize");
    if (globalThis.Array.isArray(value)) return this.typeCastArray(value, "deserialize");
    return super.deserialize(value);
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

  map(value: unknown, block: (value: unknown) => unknown): unknown {
    return globalThis.Array.isArray(value)
      ? value.map((element) => block(element))
      : this.subtype.map!(value as never, block);
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    const oldValue = this.deserialize(rawOldValue);
    return !rbEqual(oldValue, newValue);
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
  readonly encoder: PgTextEncoderArray;
  readonly values: unknown[];

  constructor(encoder: PgTextEncoderArray, values: unknown[]) {
    this.encoder = encoder;
    this.values = values;
  }

  toString(): string {
    return this.encoder.encode(this.values);
  }

  toPostgres(): string {
    return this.toString();
  }
}
