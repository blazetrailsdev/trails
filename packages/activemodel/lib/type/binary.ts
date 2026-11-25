import { unpack1 } from "@blazetrails/ruby-compat/array";
import { rbObjAsString as toS } from "@blazetrails/ruby-compat/object";
import { rbEqual } from "@blazetrails/ruby-compat/rb-equal";
import { b } from "@blazetrails/ruby-compat/string/b";
import { ValueType } from "./value.js";

const textEncoder = new TextEncoder();

export class BinaryType extends ValueType<unknown> {
  type(): string {
    return "binary";
  }

  isBinary(): boolean {
    return true;
  }

  /** @inventedArm constructor — PERMANENT */
  cast(value: unknown): unknown {
    if (value instanceof Data) {
      return value.toString();
    } else {
      value = super.cast(value);
      if (
        typeof value === "string" ||
        (value instanceof Uint8Array && value.constructor !== Uint8Array)
      )
        value = b(value);
      return value;
    }
  }

  serialize(value: unknown): Data | null {
    if (value === null || value === undefined) return null;
    return new Data(super.serialize(value));
  }

  isChangedInPlace(rawOldValue: unknown, value: unknown): boolean {
    const oldValue = this.deserialize(rawOldValue);
    return !rbEqual(oldValue, value);
  }
}

export class Data {
  private value: Uint8Array;

  constructor(value: unknown) {
    value = toS(value);
    if (typeof value === "string") value = textEncoder.encode(value);
    this.value = value as Uint8Array;
  }

  toString(): Uint8Array {
    return this.value;
  }

  hex(): string {
    return unpack1(this.value, "H*")!;
  }

  equals(other: unknown): boolean {
    return rbEqual(other, this.toString()) || this === other;
  }

  /** @noRailsEquivalent PERMANENT */
  toStr(): Uint8Array {
    return this.toString();
  }
}
