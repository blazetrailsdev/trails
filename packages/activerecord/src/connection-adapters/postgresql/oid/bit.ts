/**
 * PostgreSQL bit string type — casts PG bit strings.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bit
 *
 * Also exports Data class used internally for bit string representation.
 */

export class Data {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
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

export class Bit {
  get type(): string {
    return "bit";
  }

  cast(value: unknown): Data | null {
    if (value == null) return null;
    if (value instanceof Data) return value;
    if (typeof value === "string") {
      if (value === "") return null;
      return new Data(value);
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Data) return value.toString();
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): Data | null {
    return this.cast(value);
  }
}
