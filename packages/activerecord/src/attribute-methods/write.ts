/**
 * Attribute writing methods.
 *
 * The actual writeAttribute implementation lives on Model (from
 * @blazetrails/activemodel), with Base adding encryption and frozen
 * checks. This module exists to match the Rails file structure for
 * ActiveRecord::AttributeMethods::Write.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */

import { Model } from "@blazetrails/activemodel";

/**
 * The Write module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write
 */
export interface Write {
  writeAttribute(name: string, value: unknown): void;
  _writeAttribute(name: string, value: unknown): void;
}

/**
 * Bypasses Base/ReadonlyAttributes' readonly attribute checks. Used
 * internally where the attribute name is already canonical. A frozen
 * attribute store will still raise at the AttributeSet level.
 *
 * Rails' public `write_attribute` also resolves `"id"` to the primary-key
 * column name and resolves aliases. Those redirects will live in our
 * AR-level `writeAttribute` override once implemented; `_writeAttribute`
 * intentionally skips them.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write#_write_attribute
 */
export function _writeAttribute(this: Model, name: string, value: unknown): void {
  Model.prototype.writeAttribute.call(this, name, value);
}
