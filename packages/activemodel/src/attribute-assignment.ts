import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { UnknownAttributeError } from "./errors.js";
import { MissingAttributeError } from "./attribute-methods.js";

interface PermittedAttributes {
  permitted?(): boolean;
  toH?(): Record<string, unknown>;
}

export function assignAttributes(model: AttributeAssignment, newAttributes: unknown): void {
  assertHashAttributes(newAttributes);

  const attrs = newAttributes;
  if (isMassAssignmentEmpty(attrs)) return;

  const sanitized = sanitizeForMassAssignment(attrs);
  _assignAttributes(model, sanitized);
}

/**
 * The mass-assignment empty-bag guard shared by every entry point that runs
 * `sanitize_for_mass_assignment` before per-key dispatch (the `Model`
 * constructor, `Model#assignAttributes`, and the ActiveRecord `Base`
 * constructor).
 *
 * Mirrors ActiveModel::AttributeAssignment#assign_attributes'
 * `return if new_attributes.empty?` (attribute_assignment.rb:32). A params-like
 * wrapper (the `ActionController::Parameters` analogue) delegates `empty?` to
 * its private parameter store (strong_parameters.rb:250) — so counting the
 * wrapper's own `Object.keys` reads its instance fields (`parameters`,
 * `_permitted`), NOT its parameter count, and an EMPTY unpermitted wrapper
 * would wrongly read as non-empty and proceed into sanitization instead of
 * being a no-op. Consult the wrapper's `empty` when present; a plain hash has
 * no such delegate, so it falls through to the key count.
 *
 * @internal Rails-private helper.
 */
export function isMassAssignmentEmpty(attrs: object): boolean {
  if (isParamsLikeWrapper(attrs)) {
    const empty = (attrs as { empty?: unknown }).empty;
    if (typeof empty === "boolean") return empty;
  }
  return Object.keys(attrs).length === 0;
}

/**
 * A non-plain object duck-typing the `ActionController::Parameters` surface
 * (`permitted`/`toH`) — distinct from a plain hash, whose own keys ARE its
 * contents. Only such a wrapper's `empty` should be consulted, so a plain hash
 * that happens to carry an `empty: <boolean>` attribute is unaffected.
 */
function isParamsLikeWrapper(attrs: object): boolean {
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  const wrapper = attrs as PermittedAttributes;
  return typeof wrapper.permitted === "function" || typeof wrapper.toH === "function";
}

export interface AttributeAssignment {
  writeAttribute(name: string, value: unknown): void;
  attributeWriterMissing?(name: string, value: unknown): void;
}

export function attributeWriterMissing(
  model: AttributeAssignment,
  name: string,
  _value: unknown,
): void {
  throw new UnknownAttributeError(model, name);
}

/** @internal Rails-private helper. */
export function _assignAttributes(
  model: AttributeAssignment,
  attributes: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(attributes)) {
    _assignAttribute(model, k, v);
  }
}

/** @internal Rails-private helper. */
export function _assignAttribute(model: AttributeAssignment, key: string, value: unknown): void {
  const setter = findSetter(model, key);
  if (setter) {
    setter.call(model, value);
    return;
  }
  try {
    model.writeAttribute(key, value);
  } catch (error) {
    // Rails `_assign_attribute` only writes through a setter; a key with no
    // setter goes straight to `attribute_writer_missing` → UnknownAttributeError.
    // trails routes the write through `writeAttribute`, which now raises
    // `MissingAttributeError` for an unknown name (the strict `write_from_user`
    // path). Either way — an explicit UnknownAttributeError or a strict
    // MissingAttributeError with no setter — surface it as Rails does.
    if (error instanceof UnknownAttributeError || error instanceof MissingAttributeError) {
      if (typeof model.attributeWriterMissing === "function") {
        model.attributeWriterMissing(key, value);
      } else {
        attributeWriterMissing(model, key, value);
      }
    } else {
      throw error;
    }
  }
}

/** @internal Rails-private helper. */
export function sanitizeForMassAssignment(
  attributes: Record<string, unknown>,
): Record<string, unknown> {
  const attrs = attributes as Record<string, unknown> & PermittedAttributes;
  // Mirrors ActiveModel::ForbiddenAttributesProtection#sanitize_for_mass_assignment:
  // params-style objects expose `permitted?` — raise unless permitted, then
  // unwrap via `to_h` so the caller iterates a plain hash, not the wrapper.
  // Rails calls `attributes.to_h` unconditionally; a permitted params object is
  // expected to respond to it (a malformed one would NoMethodError there too).
  if (typeof attrs.permitted === "function") {
    if (!attrs.permitted()) {
      throw new ForbiddenAttributesError();
    }
    return attrs.toH!();
  }
  return attributes;
}

/**
 * Enforces ActiveModel::AttributeAssignment#assign_attributes' guard
 * (attribute_assignment.rb:29-30): a non-hash argument raises ArgumentError,
 * not a raw TypeError. Shared by every entry point that mass-assigns —
 * `Model#assignAttributes`, this module's `assignAttributes`, and ActiveRecord
 * `#update`/`#update!` (which iterate a raw writeAttribute loop) — so all
 * agree on the class and message text for the same input.
 *
 * Rails checks `respond_to?(:each_pair)`, so a Ruby Date/Time/Struct raises
 * here; JS has no `each_pair`, so we accept a plain object (prototype is
 * `Object.prototype` or null) or a params-style wrapper that duck-types
 * `permitted?`/`to_h` (ActionController::Parameters' analogue). A Date, Map,
 * Set, or arbitrary class instance has no hash semantics and raises.
 *
 * KNOWN GAP: `HashWithIndifferentAccess` is a Hash subclass that Rails' guard
 * admits (it inherits `Hash#each_pair`), but trails HWIA stores entries in a
 * private `Map` — so it fails this proto/duck-type check AND the downstream
 * `_assignAttributes` `Object.entries` loop can't read it either (a pre-existing
 * silent no-op). Real HWIA mass-assignment is tracked separately in
 * `assign-attributes-hwia-each-pair`; this guard does not regress it (it was
 * never assigned before).
 */
export function assertHashAttributes(attrs: unknown): asserts attrs is Record<string, unknown> {
  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs) || !isHashLike(attrs)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${typeNameForError(attrs)} passed.`,
    );
  }
}

/**
 * A plain object (literal / `Object.create(null)`) has hash semantics, as does
 * a params-style wrapper duck-typing `permitted`/`toH` — the trails analogue of
 * `ActionController::Parameters`, which Rails admits via `respond_to?(:each_pair)`.
 * Everything else (Date, Map, Set, arbitrary class instances) is rejected.
 */
function isHashLike(attrs: object): boolean {
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return true;
  const wrapper = attrs as PermittedAttributes;
  // For the real ActionController::Parameters, `permitted` is a boolean getter
  // (strong-parameters.ts:113), not a method, so `toH` is the load-bearing check
  // that admits it here; the `permitted` function-probe covers other duck-typed
  // wrappers. (sanitizeForMassAssignment has the same permitted-as-function
  // assumption — tracked in `sanitize-mass-assignment-permitted-getter`.)
  return typeof wrapper.permitted === "function" || typeof wrapper.toH === "function";
}

function typeNameForError(value: unknown): string {
  // Ruby: nil.class #=> NilClass (not "Null").
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
  // Mirror Ruby's `value.class` name: a class instance (Date, Time, …) reports
  // its constructor name, not the generic "Object" that `typeof` collapses to.
  const ctorName = (value as { constructor?: { name?: string } } | undefined)?.constructor?.name;
  if (ctorName) return ctorName;
  const t = typeof value;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Walk instance → prototype chain looking for a setter descriptor for `key`.
 * Mirrors Rails' `public_send("#{k}=", v)` dispatch
 * (activemodel/lib/active_model/attribute_assignment.rb:67-70), which routes
 * through any user-defined `attr_writer` / `def name=` before the attribute
 * store sees the value.
 *
 * Starts at the instance itself (JS analogue of Ruby singleton methods —
 * `Object.defineProperty(model, key, { set })`) and walks up, stopping before
 * `Object.prototype` so built-in accessors like `__proto__` can't hijack
 * mass assignment.
 *
 * Matches either of:
 * - a user-defined setter on a subclass prototype
 *   (`class Cat extends Model { set name(v) { … } }`), or
 * - a framework-generated setter installed by `this.attribute("name", …)`
 *   (see attributes.ts:110-120), which just forwards to `writeAttribute` —
 *   so the net behaviour for non-overridden attributes is unchanged. The
 *   `hasOwnProperty` guard in `attributes.ts` preserves a user-authored
 *   `set name` if declared in the class body.
 *
 * Walks the full chain regardless of shadowing descriptors: Ruby looks up
 * `name=` as its own method, independent of any `name` getter. A get-only
 * accessor or a data descriptor at one level does not hide a setter
 * defined higher up, so neither should our walk.
 */
function findSetter(model: object, key: string): ((this: object, value: unknown) => void) | null {
  let obj: object | null = model;
  while (obj && obj !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && typeof desc.set === "function") {
      return desc.set as (this: object, value: unknown) => void;
    }
    obj = Object.getPrototypeOf(obj);
  }
  return null;
}

class ArgumentError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/**
 * Mirror of Ruby's `TypeError`. Rails' `Kernel.Float` raises it on
 * non-Numeric/non-String input; porting it lets numericality option
 * coercion surface the same class instead of a bare `throw new Error`.
 */
class TypeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeError";
  }
}

/**
 * Mirror of Ruby's `NameError`. Raised when a name reference is invalid —
 * e.g. `record.method(:missing)`, which Ruby answers with `NameError`
 * (not its `NoMethodError` subclass).
 */
class NameError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "NameError";
  }
}

/**
 * Mirror of Ruby's `NoMethodError` (a subclass of `NameError`). Raised when
 * a method is sent to a receiver that does not respond to it (e.g.
 * `nil.include?`); porting it keeps validator guards that emulate that path
 * faithful to Rails.
 */
class NoMethodError extends NameError {
  constructor(message: string) {
    super(message);
    this.name = "NoMethodError";
  }
}

export { ArgumentError, TypeError, NameError, NoMethodError };
