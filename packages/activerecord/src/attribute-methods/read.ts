/**
 * Attribute reading methods.
 *
 * The actual readAttribute implementation lives on Model (from
 * @blazetrails/activemodel). This module exists to match the Rails
 * file structure for ActiveRecord::AttributeMethods::Read.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */

import type { AttributeSet } from "@blazetrails/activemodel";

/**
 * The Read module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read
 */
export interface Read {
  readAttribute(name: string): unknown;
  _readAttribute(name: string): unknown;
}

interface AttributeHolder {
  _attributes: AttributeSet;
}

/**
 * Reads directly from the attribute store, bypassing any model-level
 * overrides of `readAttribute` (e.g. alias resolution or the serialize.ts
 * patch). Used internally where the attribute name is already canonical.
 *
 * Rails' public `read_attribute` also resolves `"id"` to the primary-key
 * column name. That redirect will live in our AR-level `readAttribute`
 * override once implemented; `_readAttribute` intentionally skips it.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Read#_read_attribute
 */
export function _readAttribute(this: AttributeHolder, name: string): unknown {
  return this._attributes.fetchValue(name) ?? null;
}
