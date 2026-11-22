import { rbObjAsString } from "@blazetrails/ruby-compat";
import { SimpleEncoder } from "../simple-encoder.js";
import { PG } from "../namespaces.js";

export class Boolean extends SimpleEncoder {
  encode(value: unknown, _encoding: unknown = null): string | null {
    switch (typeof value) {
      case "boolean":
        return value ? "t" : "f";
      case "number":
      case "bigint":
        if (globalThis.Number(value) === 0) return "0";
        if (globalThis.Number(value) === 1) return "1";
        return globalThis.String(value);
      default:
        return value == null ? null : rbObjAsString(value);
    }
  }
}

PG.TextEncoder.Boolean = Boolean;
