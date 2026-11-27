import { rbObjAsString } from "@blazetrails/ruby-compat/object";
import { SimpleEncoder } from "../simple-encoder.js";
import { PG } from "../namespaces.js";

export class Integer extends SimpleEncoder {
  encode(value: unknown, _encoding: unknown = null): string | null {
    if (value == null) return null;
    return typeof value === "number" ? Math.trunc(value).toString() : rbObjAsString(value);
  }
}

PG.TextEncoder.Integer = Integer;
