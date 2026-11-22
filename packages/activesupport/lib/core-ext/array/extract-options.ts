import { Module, rbObjIsKindOf } from "@blazetrails/ruby-compat/include";

type AnyObject = Record<string, unknown>;

export function isExtractableOptions(self: unknown): boolean {
  if (self !== null && typeof self === "object" && "isExtractableOptions" in self) {
    return (self as { isExtractableOptions(): boolean }).isExtractableOptions();
  }
  if (self === null || typeof self !== "object" || Array.isArray(self)) return false;
  const proto = Object.getPrototypeOf(self);
  return proto === Object.prototype || proto === null;
}

export function extractOptionsBang<T>(args: T[]): AnyObject {
  const last: unknown = args[args.length - 1];
  const isHash =
    last !== null &&
    typeof last === "object" &&
    !Array.isArray(last) &&
    !rbObjIsKindOf(last, Module);
  if (args.length > 0 && isHash && isExtractableOptions(last)) {
    args.pop();
    return last as AnyObject;
  }
  return {};
}
