import type { Base } from "./base.js";
import { Model, MissingAttributeError, resolveAliasName } from "@blazetrails/activemodel";
import { ActiveRecordError } from "./errors.js";
import { raiseOnAssignToAttrReadonly, setRaiseOnAssignToAttrReadonly } from "./ar-config.js";

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
 * Reads `ActiveRecord.raise_on_assign_to_attr_readonly` — the canonical module
 * flag lives in `ar-config.ts` (default false, active_record.rb:343). Re-exported
 * here so the historic `getRaiseOnAssignToAttrReadonly`/`setRaiseOnAssignToAttrReadonly`
 * public surface stays put while the home is the single ar-config binding.
 *
 * Mirrors: ActiveRecord.raise_on_assign_to_attr_readonly
 */
export function getRaiseOnAssignToAttrReadonly(): boolean {
  return raiseOnAssignToAttrReadonly;
}

export { setRaiseOnAssignToAttrReadonly };

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
  // Rails reads `raise_on_assign_to_attr_readonly` HERE, at declaration time
  // (readonly_attributes.rb:33), and only `include HasReadonlyAttributes` — the
  // write guards — when it is true. Capture that decision per-class: a later
  // flip of the live flag does not retroactively arm (or disarm) the guards on
  // an already-declared model. `include` is idempotent and one-way, so we never
  // clear the flag once set.
  if (raiseOnAssignToAttrReadonly) {
    (this as any)._readonlyAttributesRaise = true;
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
 *     when the guard was armed at declaration time (`_readonlyAttributesRaise`,
 *     captured from `raise_on_assign_to_attr_readonly` when `attrReadonly` ran);
 *     otherwise the write falls through to `super` and the value is written in
 *     memory (Rails leaves HasReadonlyAttributes uninstalled in that case).
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
  // `write_from_user` (write.rb:35: `name = @primary_key if name == "id" &&
  // @primary_key`), where `@primary_key` is `klass.primary_key` (core.rb:844).
  // - Scalar custom PK: `@primary_key` is a string, so `id` remaps to the real
  //   PK column (a standard `id` PK remaps to itself, a no-op).
  // - Composite PK: `@primary_key` is the array, so Rails calls
  //   `write_from_user([...], v)`; the array key misses the attribute hash and
  //   resolves to a `Null` attribute → `MissingAttributeError` — even when the
  //   table has a real `id` column (e.g. cpk_books). Mirror that raise here
  //   rather than writing the scalar `id`. (Composite `id=` assignment flows
  //   through the per-column `_writeAttribute` path, not this one.)
  const pk = ctor.primaryKey;
  if (canonical === "id" && pk != null) {
    if (typeof pk === "string") {
      canonical = pk;
    } else if (!(this as { _initializingAttributes?: boolean })._initializingAttributes) {
      // Rails calls `write_from_user(@primary_key, …)` with the PK array, so the
      // Null attribute's name — and the interpolated message (attribute.rb:236) —
      // is the array in Ruby `#inspect` form, e.g. `["author_id", "id"]`.
      const arrayName = `[${pk.map((c) => `"${c}"`).join(", ")}]`;
      throw new MissingAttributeError(`can't write unknown attribute \`${arrayName}\``);
    }
  }
  // Rails only installs this guard when `raise_on_assign_to_attr_readonly` was
  // true at `attr_readonly` declaration time (captured in `_readonlyAttributesRaise`).
  // When it was false the guard is absent, so the write falls straight through to
  // `super` — the value IS written in memory; persist-time exclusion of readonly
  // columns (attributesForUpdate) keeps it out of the UPDATE.
  if (
    this._newRecord === false &&
    (ctor as { _readonlyAttributesRaise?: boolean })._readonlyAttributesRaise &&
    ctor.readonlyAttributeQ(canonical)
  ) {
    throw new ReadonlyAttributeError(canonical);
  }
  // Mirrors Rails `write_attribute` → `write_from_user`: writing an unknown
  // attribute raises MissingAttributeError. The raise originates in
  // `AttributeSet#writeFromUser` (the schema cache is always warm, so an absent
  // name is definitively unknown). Mass assignment routes through here too but
  // rescues it (attribute-assignment.ts), so `new X({unknown: 1})` stays lenient.
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
  if (
    this._newRecord === false &&
    (ctor as { _readonlyAttributesRaise?: boolean })._readonlyAttributesRaise &&
    ctor.readonlyAttributeQ(String(name))
  ) {
    throw new ReadonlyAttributeError(String(name));
  }
  // Mirrors Rails `_write_attribute`: skip alias resolution, unlike the public
  // `write_attribute` path above. Rails (write.rb:42) reaches `write_from_user`
  // and raises for an unknown name, because in Rails the PK/timestamp/locking
  // columns these internal writers target are always in the attribute set.
  //
  // trails' set is NOT always complete: a model on a raw-created table whose
  // schema cache was never warmed (e.g. the PG/MySQL adapter test suites, which
  // `adapter.exec("CREATE TABLE …")` then use immediately) cannot reflect its
  // columns synchronously on an async driver, so the post-INSERT PK write-back
  // (and timestamp writes) would hit the strict `writeFromUser` and raise.
  //
  // BRIDGE (RFC 0046, story remove-internal-write-bridge-converge-write-attribute-strict):
  // keep the low-level internal path lenient — seed the unreflected real column
  // directly when `writeFromUser` raises — so the public `writeAttribute` /
  // `[]=` / mass-assignment paths stay strict (the heart of this story) while
  // the framework's own writes survive an incomplete set. Removed once every
  // bespoke test model declares its real columns (RFC 0046).
  //
  // A null/undefined name is NOT bridged: that is `id = …` on a key-less table
  // (`setId` → `_writeAttribute(@primary_key=null, value)`), which must raise
  // `MissingAttributeError` like Rails. The framework write-backs that rely on
  // the bridge always target a real (string) column name.
  try {
    Model.prototype._writeAttribute.call(this, name, value);
  } catch (error) {
    if (!(error instanceof MissingAttributeError) || name == null) throw error;
    this._attributes.writeCastValue(name, value);
  }
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
