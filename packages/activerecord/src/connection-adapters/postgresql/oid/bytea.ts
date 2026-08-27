import { BinaryType, BinaryData } from "@blazetrails/activemodel";
import { unescapeBytea } from "../quoting.js";

export class Bytea extends BinaryType {
  override deserialize(value: unknown): unknown {
    if (value == null) return null;
    if (value instanceof BinaryData) return value.bytes;
    if (typeof value === "string") return unescapeBytea(value);
    return super.deserialize(value);
  }
}
