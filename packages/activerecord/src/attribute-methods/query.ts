import { included, isBlank } from "@blazetrails/activesupport";
import { toI } from "@blazetrails/ruby-compat";
import { BooleanType, type ValueType } from "@blazetrails/activemodel";
import { AttributeMethods } from "../namespaces.js";

interface QueryIncludeHost {
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
}

interface QueryHost {
  _readAttribute(name: string): unknown;
  typeForAttribute(name: string, block?: () => ValueType): ValueType | null;
}

export const Query = {
  [included](base: QueryIncludeHost): void {
    base.attributeMethodSuffix("?", { parameters: false });
  },
  queryAttribute,
  _queryAttribute,
  "attribute?": queryAttribute,
  queryCastAttribute,
};

export function queryAttribute(this: QueryHost, attrName: string): boolean {
  const value = publicSend(this, attrName);

  return queryCastAttribute.call(this, attrName, value);
}

function publicSend(obj: object, name: string): unknown {
  const ownDesc = Object.getOwnPropertyDescriptor(obj, name);
  if (ownDesc) {
    if (ownDesc.get) return (obj as Record<string, unknown>)[name];
    if (typeof ownDesc.value === "function") return (ownDesc.value as () => unknown).call(obj);
    return ownDesc.value;
  }
  let proto = Object.getPrototypeOf(obj) as object | null;
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (desc) {
      if (desc.get) return (obj as Record<string, unknown>)[name];
      if (typeof desc.value === "function") return (desc.value as () => unknown).call(obj);
      break;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return (obj as Record<string, unknown>)[name];
}

export function _queryAttribute(this: QueryHost, attrName: string): boolean {
  const value = this._readAttribute(attrName);

  return queryCastAttribute.call(this, attrName, value);
}

/** @internal */
export function queryCastAttribute(this: QueryHost, attrName: string, value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (!this.typeForAttribute(attrName, () => false as unknown as ValueType)) {
    if (typeof value === "number" || typeof value === "bigint" || !/[^0-9]/.test(String(value))) {
      return toI(value) != 0;
    }
    if (BooleanType.FALSE_VALUES.has(value)) return false;
    return !isBlank(value);
  } else if (typeof value === "number" || typeof value === "bigint") {
    return value !== 0 && value !== 0n;
  } else {
    return !isBlank(value);
  }
}

AttributeMethods.Query = Query;
