/**
 * Attribute query methods (the `attribute?` pattern from Ruby).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query
 */

import { BooleanType } from "@blazetrails/activemodel";

const booleanType = new BooleanType();

interface Queryable {
  readAttribute(name: string): unknown;
}

/**
 * Query whether an attribute value is truthy.
 * Equivalent to Ruby's `record.attribute?` pattern.
 *
 * Uses ActiveModel's BooleanType for consistent casting with the
 * rest of the framework (handles "0", "f", "false", "off", "no", etc.).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Query#query_attribute
 */
export function queryAttribute(this: Queryable, name: string): boolean {
  const value = this.readAttribute(name);
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value !== 0;
  const cast = booleanType.cast(value);
  if (cast !== null) return cast;
  return !!value;
}
