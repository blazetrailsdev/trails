/**
 * Attribute query methods (the `attribute?` pattern from Ruby).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query
 */

import { BooleanType } from "@blazetrails/activemodel";

const booleanType = new BooleanType();

interface PublicSendable {
  [key: string]: unknown;
}

interface RawReadable {
  _readAttribute(name: string): unknown;
}

/**
 * Query whether an attribute value is truthy.
 *
 * Calls the getter method by name (like Rails' public_send), so overridden
 * getters and virtual attributes are respected.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query#query_attribute
 */
export function queryAttribute(this: PublicSendable, name: string): boolean {
  return castToBoolean(publicSend(this, name));
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
export function _queryAttribute(this: RawReadable, name: string): boolean {
  return castToBoolean(this._readAttribute(name));
}

function castToBoolean(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value !== 0;
  const cast = booleanType.cast(value);
  if (cast !== null) return cast;
  return !!value;
}
