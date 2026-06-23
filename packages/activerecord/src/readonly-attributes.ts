import type { Base } from "./base.js";
import { Model, MissingAttributeError, resolveAliasName } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";

/**
 * Rails' `write_from_user` raises `MissingAttributeError` for any name that is
 * not in the (schema-complete) attribute set — e.g. `topic[:no_column_exists] =
 * …`. trails populates the set lazily, so map-absence alone cannot stand in for
 * "unknown column": a real but not-yet-materialized/unselected column (an
 * unselected `title`, a reflected-only counter-cache column, a composite-PK
 * member) is also absent, and Rails does NOT raise for those ("write_attribute
 * does not raise when the attribute isn't selected").
 *
 * The safe discriminator is the warm schema cache: when the table's real
 * columns are known ({@link reflectedColumnNamesIfWarm}), an absent name not
 * among them is definitively unknown and raises, while every real column —
 * selected or not — is in that set and passes. When the cache is cold trails
 * cannot yet list reflected-only columns, so we stay lenient there; closing
 * that gap (and widening `AttributeSet#writeFromUser` itself to the Rails
 * one-liner) is gated on RFC 0031 schema-cache-always-warm.
 */
function ensureWritableAttribute(record: Base, ctor: typeof Base, name: string): void {
  if ((record as { _initializingAttributes?: boolean })._initializingAttributes) return;
  if (record._attributes.includesName(name)) return;
  if ((ctor as { _attributeDefinitions?: Map<string, unknown> })._attributeDefinitions?.has(name))
    return;
  // A counter-cache column is registered as part of the model's writable schema
  // (Rails' `counter_cache_column`), so it is a legitimate write target even
  // when it isn't reflected as a plain column on a partially-loaded record.
  if ((ctor as { _counterCacheColumns?: Set<string> })._counterCacheColumns?.has(name)) return;
  const realColumns = ctor.reflectedColumnNamesIfWarm();
  if (realColumns && !realColumns.has(name)) {
    throw new MissingAttributeError(`can't write unknown attribute \`${name}\``);
  }
}

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
/**
 * When false, assigning to a readonly attribute silently skips the write
 * instead of raising ReadonlyAttributeError.
 *
 * Mirrors: ActiveRecord.raise_on_assign_to_attr_readonly
 */
let _raiseOnAssignToAttrReadonly = true;

export function getRaiseOnAssignToAttrReadonly(): boolean {
  return _raiseOnAssignToAttrReadonly;
}

export function setRaiseOnAssignToAttrReadonly(value: boolean): void {
  _raiseOnAssignToAttrReadonly = value;
}

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
 *   - frozen record: raises `Cannot modify a frozen X`.
 *   - readonly column on a persisted record: raises `ReadonlyAttributeError`
 *     when `getRaiseOnAssignToAttrReadonly()` is true (default); silently
 *     skips the write when false — mirrors `raise_on_assign_to_attr_readonly`.
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
  // Rails' `write_attribute` resolves `attribute_aliases[name]` before the
  // chain runs, so HasReadonlyAttributes' check sees the canonical name and
  // writing via an alias cannot bypass readonly enforcement.
  let canonical = resolveAliasName(ctor, String(name));
  // Rails `write_attribute` remaps the `id` literal to the primary key before
  // `write_from_user` (write.rb:34: `name = @primary_key if name == "id" &&
  // @primary_key`). Mirror it for a scalar custom PK so `writeAttribute("id")`
  // lands on the real PK column instead of being rejected as unknown. A
  // composite PK keeps the `id` name and is rejected below exactly as Rails'
  // `write_from_user(array)` raises (the array key resolves to a Null
  // attribute) — and a standard `id` PK remaps to itself (a no-op).
  const pk = ctor.primaryKey;
  if (canonical === "id" && typeof pk === "string" && pk) {
    canonical = pk;
  }
  if (this._newRecord === false && ctor.readonlyAttributeQ(canonical)) {
    if (_raiseOnAssignToAttrReadonly) {
      throw new ReadonlyAttributeError(canonical);
    }
    return; // silently skip — mirrors Rails' non-raising mode
  }
  // Mirrors Rails `write_attribute` → `write_from_user`: writing an unknown
  // attribute raises MissingAttributeError. Mass assignment routes through here
  // too but rescues this (attribute-assignment.ts), so `new X({unknown: 1})`
  // stays lenient.
  ensureWritableAttribute(this, ctor, canonical);
  // `super` — route through Model's _writeAttribute with the already-resolved
  // canonical name, matching Rails' `super` into the underscore path.
  Model.prototype._writeAttribute.call(this, canonical, value);
}

/**
 * Low-level write that checks readonly but bypasses the frozen-record guard.
 *
 * Mirrors: ActiveRecord::HasReadonlyAttributes#_write_attribute
 */
export function _writeAttribute(this: Base, name: string, value: unknown): void {
  const ctor = this.constructor as typeof Base;
  if (this._newRecord === false && ctor.readonlyAttributeQ(String(name))) {
    if (_raiseOnAssignToAttrReadonly) {
      throw new ReadonlyAttributeError(String(name));
    }
    return;
  }
  // Mirrors Rails `_write_attribute`: skip alias resolution, unlike the
  // public `write_attribute` path above.
  //
  // The strict unknown-attribute raise is deliberately NOT applied here. Rails'
  // `_write_attribute` does reach `write_from_user` and so raises (write.rb:42),
  // but trails routes its low-level/internal writes through this path —
  // store-accessor fallbacks, composite-PK seeding in `_applyCompositePrimaryKey`
  // (which runs after the constructor's lenient `_initializingAttributes`
  // window), and other framework writers — some of which target names that are
  // not plain reflected columns or run before the schema cache is warm. Gating
  // here would regress those; the public `writeAttribute` carries the Rails
  // strictness, which is where user `[]=` / `write_attribute` lands. Closing this
  // is part of the same RFC 0031 warm-cache convergence that lets
  // `AttributeSet#writeFromUser` raise directly.
  Model.prototype._writeAttribute.call(this, name, value);
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
