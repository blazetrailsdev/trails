import { rbCSymbol } from "@blazetrails/ruby-compat/object";
import { symbolToS } from "@blazetrails/ruby-compat/symbol";
import { rbClearMethodCache } from "@blazetrails/ruby-compat/method-cache";

export function toMsgpackExt(this: string): string {
  return symbolToS(this);
}

export function fromMsgpackExt(data: Uint8Array): string {
  try {
    return `:${new TextDecoder("utf-8", { fatal: true }).decode(data)}`;
  } catch (error) {
    if (!(error instanceof globalThis.TypeError)) throw error;
    return `:${Array.from(data, (byte) => String.fromCharCode(byte)).join("")}`;
  }
}

Object.assign(rbCSymbol.prototype, { toMsgpackExt });
rbClearMethodCache();
Object.assign(rbCSymbol, { fromMsgpackExt });
