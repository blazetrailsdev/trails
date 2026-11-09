import { isSymbol, rbFSend, rbObjRespondTo, symbolToS } from "@blazetrails/ruby-compat";

export interface ResolveValue {
  resolveValue(record: unknown, value: unknown): unknown;
}

export function resolveValue(record: unknown, value: unknown): unknown {
  if (typeof value === "function") {
    if (value.length === 0) {
      return (value as () => unknown)();
    } else {
      return (value as (record: unknown) => unknown)(record);
    }
  } else if (isSymbol(value)) {
    return rbFSend(record, symbolToS(value));
  } else {
    if (rbObjRespondTo(value, "call")) {
      return (value as { call(record: unknown): unknown }).call(record);
    } else {
      return value;
    }
  }
}
