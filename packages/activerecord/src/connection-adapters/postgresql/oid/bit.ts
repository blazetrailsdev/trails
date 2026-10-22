import { rbObjAsString, rbStrHex, registerConstant, rtest } from "@blazetrails/ruby-compat";
import { ValueType } from "@blazetrails/activemodel";

export class Bit extends ValueType<string> {
  override type(): string {
    return "bit";
  }

  castValue(value: unknown): string {
    if (typeof value === "string") {
      if (/^0x/i.test(value)) {
        return rbStrHex(value.slice(2)).toString(2);
      } else {
        return value;
      }
    } else {
      return rbObjAsString(value);
    }
  }

  override serialize(value: unknown): Data | null {
    if (rtest(value)) return new Data(super.serialize(value) as string);
    return null;
  }
}

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

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Bit", Bit);
