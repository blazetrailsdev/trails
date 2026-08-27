import { ValueType } from "@blazetrails/activemodel";

export class Data {
  /** @internal */
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  toString(): string {
    return this.value;
  }

  isBinary(): boolean {
    return /^[01]*$/.test(this.value);
  }

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

export class Bit extends ValueType<string> {
  readonly name: string = "bit";

  override type(): string {
    return "bit";
  }

  cast(value: unknown): string | null {
    return this.castValue(value);
  }

  override serialize(value: unknown): Data | null {
    if (value == null) return null;
    if (value instanceof Data) return value;
    return new Data(typeof value === "string" ? value : String(value));
  }

  override deserialize(value: unknown): string | null {
    return this.castValue(value);
  }

  castValue(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") {
      if (/^0x/i.test(value)) {
        const leadingHex = value.slice(2).match(/^[0-9a-f]+/i)?.[0] ?? "0";
        return BigInt(`0x${leadingHex}`).toString(2);
      }
      return value;
    }
    return String(value);
  }
}
