import { rbObjAsString } from "@blazetrails/ruby-compat";
import { SimpleEncoder } from "../simple-encoder.js";
import { PG } from "../namespaces.js";

/** @noRailsEquivalent PERMANENT */
export class Integer extends SimpleEncoder {
  /** @noRailsEquivalent PERMANENT */
  encode(value: unknown, _encoding: unknown = null): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    return typeof value === "number" ? Math.trunc(value).toString() : rbObjAsString(value);
  }
}

PG.TextEncoder.Integer = Integer;
