import type { Base } from "./base.js";
import { Model } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";

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
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#attr_readonly
 */
export function attrReadonly(this: typeof Base, ...attributes: string[]): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_readonlyAttributes")) {
    (this as any)._readonlyAttributes = new Set((this as any)._readonlyAttributes);
  }
  for (const attr of attributes) {
    (this as any)._readonlyAttributes.add(attr);
  }
}

/**
 * Return the list of readonly attribute names for a model class.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attributes
 */
export function readonlyAttributes(this: typeof Base): string[] {
  return Array.from((this as any)._readonlyAttributes ?? []);
}

/**
 * Check if a specific attribute is readonly.
 *
 * Mirrors: ActiveRecord::ReadonlyAttributes::ClassMethods#readonly_attribute?
 * (The `Q` suffix mirrors Ruby's `?` predicate convention.)
 */
export function readonlyAttributeQ(this: typeof Base, attribute: string): boolean {
  return ((this as any)._readonlyAttributes as Set<string> | undefined)?.has(attribute) ?? false;
}

/**
 * AR's `write_attribute` override — Rails' `HasReadonlyAttributes` mixin in
 * readonly_attributes.rb (line 49). Adds two guards before delegating to the
 * base Model implementation:
 *
 *   - frozen record: raises `Cannot modify a frozen X` (matching the
 *     pre-extraction message and test coverage).
 *   - readonly column on a persisted record: raises ReadonlyAttributeError,
 *     matching Rails' HasReadonlyAttributes#write_attribute.
 *
 * During construction the `_newRecord` field initializer on `Base` hasn't
 * run yet when `Model`'s constructor invokes `writeAttribute` — gate the
 * readonly check on the definitively-persisted state (`_newRecord === false`)
 * rather than `!isNewRecord()` so initial assignments during `new X(...)`
 * aren't mistakenly blocked.
 *
 * `Base.prototype.writeAttribute` installed via include() in base.ts.
 *
 * Mirrors: ActiveRecord::HasReadonlyAttributes#write_attribute
 */
export function writeAttribute(this: Base, name: string, value: unknown): void {
  if (this._attributes.isFrozen()) {
    throw new Error(`Cannot modify a frozen ${(this.constructor as typeof Base).name}`);
  }
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(name))) {
    throw new ReadonlyAttributeError(String(name));
  }
  // `super` — route through Model's writeAttribute (the next ancestor with
  // a writeAttribute impl, matching Rails' `super` in HasReadonlyAttributes).
  Model.prototype.writeAttribute.call(this, name, value);
}

/**
 * Low-level write that checks readonly but bypasses the frozen-record guard.
 *
 * Mirrors: ActiveRecord::HasReadonlyAttributes#_write_attribute
 */
export function _writeAttribute(this: Base, name: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(name))) {
    throw new ReadonlyAttributeError(String(name));
  }
  Model.prototype.writeAttribute.call(this, name, value);
}

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
  isReadonlyAttribute: readonlyAttributeQ,
};
