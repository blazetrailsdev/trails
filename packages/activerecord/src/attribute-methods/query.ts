/**
 * Attribute query methods (the `attribute?` pattern from Ruby).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query
 */

import { isBlank } from "@blazetrails/activesupport";
import { BooleanType, type Type } from "@blazetrails/activemodel";

interface QueryHost {
  _readAttribute(name: string): unknown;
  typeForAttribute(name: string, block?: () => Type): Type;
}

/**
 * Query whether an attribute value is truthy.
 *
 * Calls the getter method by name (like Rails' public_send), so overridden
 * getters and virtual attributes are respected.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query#query_attribute
 */
export function queryAttribute(this: QueryHost, attrName: string): boolean {
  const value = publicSend(this, attrName);

  return queryCastAttribute.call(this, attrName, value);
}

function publicSend(obj: object, name: string): unknown {
  // Check own property first (singleton methods assigned per-instance)
  const ownDesc = Object.getOwnPropertyDescriptor(obj, name);
  if (ownDesc) {
    if (ownDesc.get) return (obj as Record<string, unknown>)[name];
    if (typeof ownDesc.value === "function") return (ownDesc.value as () => unknown).call(obj);
    return ownDesc.value;
  }
  // Walk prototype chain for accessor getters and prototype methods
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

/**
 * Like queryAttribute but reads via _readAttribute, bypassing alias
 * resolution — used internally where the name is already canonical.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query#_query_attribute
 */
export function _queryAttribute(this: QueryHost, attrName: string): boolean {
  const value = this._readAttribute(attrName);

  return queryCastAttribute.call(this, attrName, value);
}

// Mirrors: ActiveRecord::AttributeMethods::Query private#query_cast_attribute
// (attribute_methods/query.rb:29-46).
/** @internal */
export function queryCastAttribute(this: QueryHost, attrName: string, value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  // Ruby `!type_for_attribute(attr_name) { false }` — the block supplies
  // `false` when the name is not a declared attribute, so the negation is
  // "this is a virtual/method-backed name", and the value has to be coerced
  // from its raw form rather than through a column type.
  if (!this.typeForAttribute(attrName, () => false as unknown as Type)) {
    if (typeof value === "number" || typeof value === "bigint" || !/[^0-9]/.test(String(value))) {
      return toI(value) !== 0;
    }
    if (BooleanType.FALSE_VALUES.has(value)) return false;
    return !isBlank(value);
  } else if (typeof value === "number" || typeof value === "bigint") {
    // Ruby `value.respond_to?(:zero?)` — the Numeric protocol.
    return value != 0;
  } else {
    return !isBlank(value);
  }
}

// Ruby String#to_i: leading integer prefix, 0 when there is none.
function toI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  const m = /^\s*[+-]?\d+/.exec(String(value));
  return m ? parseInt(m[0], 10) : 0;
}
