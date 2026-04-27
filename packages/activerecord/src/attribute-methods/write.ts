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

import { Model, AttrNames } from "@blazetrails/activemodel";

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
 * Low-level attribute write — skips alias resolution and `"id"` → primary-key
 * remapping that `write_attribute` performs, but readonly enforcement is
 * applied by `ReadonlyAttributes._writeAttribute` (wired in base.ts),
 * matching Rails' `HasReadonlyAttributes#_write_attribute`.
 *
 * This function is the fallback used when `Base._writeAttribute` is not yet
 * available (e.g. during very early bootstrap). At runtime it is shadowed
 * by `ReadonlyAttributes._writeAttribute` on `Base.prototype`.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Write#_write_attribute
 */
export function _writeAttribute(this: Model, name: string, value: unknown): void {
  Model.prototype._writeAttribute.call(this, name, value);
}

// Mirrors: ActiveRecord::AttributeMethods::Write::ClassMethods private#define_method_attribute=
// Rails derives writer method metadata via defineAttributeAccessorMethod and
// uses it while generating dynamic attribute writers. TypeScript attribute
// access is handled statically, so we compute the same metadata for parity
// but intentionally do not register or define anything.
function defineMethodAttribute(canonicalName: string, _options?: unknown): void {
  const { methodName, attrNameRef } = AttrNames.defineAttributeAccessorMethod(canonicalName, true);
  void methodName;
  void attrNameRef;
}
