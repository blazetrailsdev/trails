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
}

export class Bit extends ValueType<string> {
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
