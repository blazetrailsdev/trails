import type { Base } from "./base.js";
import { Model } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";
import { ActiveRecord } from "./ar-config.js";
import { include } from "@blazetrails/activesupport";
import { writeAttribute as _writeAttributeSuper } from "./attribute-methods/write.js";

/**
 * Raised when a persisted record attempts to write to a column declared
 * via `attr_readonly`.
 *
 * The message is just the attribute name — matching Rails, which defines
 * `class ReadonlyAttributeError < ActiveRecordError; end` with no custom
 * initializer and raises via `ReadonlyAttributeError.new(attr_name)`. The
 * `.attribute` property gives programmatic access to the same value.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributeError (defined alongside
 * HasReadonlyAttributes in Rails' readonly_attributes.rb).
 */
export class ReadonlyAttributeError extends ActiveRecordError {
  readonly attribute: string;
  constructor(attribute: string) {
    super(attribute);
    this.name = "ReadonlyAttributeError";
    this.attribute = attribute;
  }
}

/**
 * Track and enforce readonly attributes on ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes
 *
 * Usage:
 *   User.attrReadonly('email', 'username')
 *   User.readonlyAttributes // => ['email', 'username']
 */

/**
 * Declare attributes as readonly. Once a record is persisted, these
 * attributes cannot be changed via update/save.
 *
 * `self._attr_readonly |= attributes.map(&:to_s)` (readonly_attributes.rb:30) —
 * `Array#|` is union-with-dedup, and the assignment (not a mutation of the
 * inherited Array) is what keeps the write local to this class.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#attr_readonly
 */
export function attrReadonly(this: typeof Base, ...attributes: string[]): void {
  (this as any)._attrReadonly = [
    ...new Set([...((this as any)._attrReadonly as string[]), ...attributes.map(String)]),
  ];
  // readonly_attributes.rb:33 — Rails reads `raise_on_assign_to_attr_readonly`
  // HERE, at declaration time, and only `include HasReadonlyAttributes` — the
  // write guards — when it is true. `include` is idempotent and one-way, so a
  // later flip of the live flag neither arms nor disarms an already-declared
  // model.
  if (ActiveRecord.raiseOnAssignToAttrReadonly) {
    include(this as unknown as new (...args: any[]) => any, HasReadonlyAttributes);
  }
}

/**
 * Return the list of readonly attribute names for a model class.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attributes
 */
export function readonlyAttributes(this: typeof Base): string[] {
  return (this as any)._attrReadonly;
}

/**
 * Check if a specific attribute is readonly.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attribute?
 * (The `Q` suffix mirrors Ruby's `?` predicate convention.)
 */
export function readonlyAttributeQ(this: typeof Base, attribute: string): boolean {
  return ((this as any)._attrReadonly as string[]).includes(attribute);
}

/**
 * Rails' `HasReadonlyAttributes#write_attribute` (readonly_attributes.rb:49-55):
 * a readonly guard, then `super` into `AttributeMethods::Write#write_attribute`
 * (write.rb:31-38), which resolves the alias, remaps `"id"` to the primary key
 * and writes. A frozen record raises from the attribute set itself, as it does
 * in Ruby, so there is no frozen guard here.
 *
 * During construction the `_newRecord` field initializer on `Base` hasn't run
 * yet when `Model`'s constructor invokes `writeAttribute` — gate the readonly
 * check on the definitively-persisted state (`_newRecord === false`) rather
 * than `!isNewRecord()` so initial assignments during `new X(...)` aren't
 * mistakenly blocked.
 *
 * Mixed onto a class by `attrReadonly` above, the way readonly_attributes.rb:33
 * `include`s the module.
 *
 * Mirrors: ActiveRecord::HasReadonlyAttributes#write_attribute
 */
export function writeAttribute(this: Base, attrName: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  // readonly_attributes.rb:50 checks the RAW `attr_name` and lets `super`
  // resolve the alias afterwards, so an aliased write escapes the guard in
  // Rails too.
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(attrName))) {
    throw new ReadonlyAttributeError(String(attrName));
  }

  _writeAttributeSuper.call(this as never, attrName, value);
}

/**
 * Mirrors: ActiveRecord::HasReadonlyAttributes#_write_attribute
 * (readonly_attributes.rb:57-62).
 */
export function _writeAttribute(this: Base, name: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(name))) {
    throw new ReadonlyAttributeError(String(name));
  }
  // Mirrors Rails `_write_attribute`: skip alias resolution, unlike the public
  // `write_attribute` path above. Rails (write.rb:42) reaches `write_from_user`
  // and raises `MissingAttributeError` for an unknown name — including
  // `id = …` on a key-less table (`PrimaryKey#id=` →
  // `_writeAttribute(@primary_key=null, value)`).
  Model.prototype._writeAttribute.call(this, name, value);
}

/**
 * The instance half of Rails' `HasReadonlyAttributes`
 * (readonly_attributes.rb:47-63), `include`d onto a class by `attrReadonly`
 * only when `raise_on_assign_to_attr_readonly` is true at declaration time.
 */
export const HasReadonlyAttributes = {
  writeAttribute,
  _writeAttribute,
};

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 *
 * Note: `readonlyAttributes` is exposed on Base as a getter for ergonomic
 * property access (TS idiom for what Rails exposes as a bare method call),
 * so it stays as a hand-rolled delegate in base.ts rather than being mixed
 * in here.
 */
export const ClassMethods = {
  attrReadonly,
  readonlyAttributeQ,
};
