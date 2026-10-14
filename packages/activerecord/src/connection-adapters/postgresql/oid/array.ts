import { ValueType } from "@blazetrails/activemodel";
import { PG } from "../../../pg/pg.js";
import { rbEqual, rbFPublicSend, rbObjAsString, registerConstant } from "@blazetrails/ruby-compat";

export interface ArraySubtype {
  readonly type?: string | (() => string | undefined);
  readonly limit?: number | null;
  readonly precision?: number | null;
  readonly scale?: number | null;
  cast(value: unknown): unknown;
  serialize(value: unknown): unknown;
  deserialize?(value: unknown): unknown;
  typeCastForSchema(value: unknown): unknown;
  map?(value: unknown, block: (value: unknown) => unknown): unknown;
  userInputInTimeZone?(value: unknown): unknown;
}

export class Array extends ValueType<unknown> {
  readonly subtype: ArraySubtype;
  readonly delimiter: string;
  private readonly pgEncoder: PG.TextEncoder.Array;
  private readonly pgDecoder: PG.TextDecoder.Array;

  override type(): string | undefined {
    const subtypeType = this.subtype.type;
    if (typeof subtypeType === "function") return subtypeType.call(this.subtype);
    return subtypeType;
  }

  userInputInTimeZone(value: unknown): unknown {
    return this.subtype.userInputInTimeZone!(value);
  }

  override get limit(): number | null {
    return this.subtype.limit ?? null;
  }

  override get precision(): number | null {
    return this.subtype.precision ?? null;
  }

  override get scale(): number | null {
    return this.subtype.scale ?? null;
  }

  constructor(subtype: ArraySubtype, delimiter: string = ",") {
    super();
    this.subtype = subtype;
    this.delimiter = delimiter;

    this.pgEncoder = new PG.TextEncoder.Array(null, {
      name: `${this.type() ?? ""}[]`,
      delimiter: delimiter,
    });
    this.pgDecoder = new PG.TextDecoder.Array(null, {
      name: `${this.type() ?? ""}[]`,
      delimiter: delimiter,
    });
  }

  override deserialize(value: unknown): unknown {
    if (typeof value === "string") {
      return this.typeCastArray(this.pgDecoder.decode(value), "deserialize");
    }
    if (value instanceof Data) return this.typeCastArray(value.values, "deserialize");
    return super.deserialize(value);
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

  override typeCastForSchema(value: unknown): unknown {
    if (!globalThis.Array.isArray(value)) return super.typeCastForSchema(value);
    return (
      "[" +
      value
        .map((v) => this.subtype.typeCastForSchema(v))
        .flat(Infinity)
        .map((v) => rbObjAsString(v))
        .join(", ") +
      "]"
    );
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

    return rbFPublicSend(this.subtype, method, value);
  }

  override isMutable(): boolean {
    return true;
  }
}

export class Data {
  readonly encoder: PG.TextEncoder.Array;
  readonly values: unknown[];

  constructor(encoder: PG.TextEncoder.Array, values: unknown[]) {
    this.encoder = encoder;
    this.values = values;
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Array", Array);
