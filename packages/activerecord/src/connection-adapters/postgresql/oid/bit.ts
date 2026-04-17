/**
 * PostgreSQL bit string type — casts PG bit strings.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bit
 */

import { Type } from "@blazetrails/activemodel";

export class Data {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  /** Mirrors Rails' Bit::Data#binary? */
  isBinary(): boolean {
    return /^[01]*$/.test(this.value);
  }

  /** Mirrors Rails' Bit::Data#hex? */
  isHex(): boolean {
    return /^[0-9A-F]*$/i.test(this.value);
  }

  toBinaryString(): string {
    if (/^[01]+$/.test(this.value)) return this.value;
    return this.value
      .split("")
      .map((c) => parseInt(c, 16).toString(2).padStart(4, "0"))
      .join("");
  }

  toHexString(): string {
    const isBinaryOnly = /^[01]+$/.test(this.value);
    if (!isBinaryOnly && /^[0-9a-fA-F]+$/.test(this.value)) return this.value;
    let hex = "";
    for (let i = 0; i < this.value.length; i += 4) {
      const chunk = this.value.substring(i, i + 4).padEnd(4, "0");
      hex += parseInt(chunk, 2).toString(16);
    }
    return hex;
  }
}

export class Bit extends Type<string> {
  readonly name: string = "bit";

  override type(): string {
    return "bit";
  }

  cast(value: unknown): string | null {
    return this.castValue(value);
  }

  override serialize(value: unknown): Data | null {
    // Rails: `Data.new(super) if value` — super is Type::Value#serialize which
    // returns the value unchanged. Do NOT route through castValue here; the
    // hex-notation normalisation only applies on read (cast/deserialize).
    if (value == null) return null;
    if (value instanceof Data) return value;
    return new Data(typeof value === "string" ? value : String(value));
  }

  override deserialize(value: unknown): string | null {
    return this.castValue(value);
  }

  /**
   * Rails' OID::Bit#cast_value. Exposed publicly so api:compare matches
   * the Rails method name and so callers can invoke the hook directly.
   */
  castValue(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") {
      // Rails: `value[2..-1].hex.to_s(2)`. Ruby's String#hex extracts
      // leading hex digits and returns 0 if none are present — so
      // "0xff" → 255, "0x" → 0, "0xZZ" → 0, "0xabZZ" → 0xab.
      // Use BigInt so arbitrarily long bit strings round-trip losslessly
      // (JS Number loses precision past 53 bits).
      if (/^0x/i.test(value)) {
        const leadingHex = value.slice(2).match(/^[0-9a-f]+/i)?.[0] ?? "0";
        return BigInt(`0x${leadingHex}`).toString(2);
      }
      return value;
    }
    return String(value);
  }
}
