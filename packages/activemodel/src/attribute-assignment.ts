import { UnknownAttributeError } from "./errors.js";

/**
 * Mirrors: ActiveModel::AttributeAssignment#assign_attributes
 * (attribute_assignment.rb:28-34):
 *
 *   def assign_attributes(new_attributes)
 *     unless new_attributes.respond_to?(:each_pair)
 *       raise ArgumentError, "When assigning attributes, you must pass a hash as an argument, #{new_attributes.class} passed."
 *     end
 *     return if new_attributes.empty?
 *
 *     _assign_attributes(sanitize_for_mass_assignment(new_attributes))
 *   end
 *
 * Both sends go through the model, as Ruby's implicit `self` receiver does, so
 * a subclass override of either is honoured — including ActiveRecord's
 * `_assign_attributes` (activerecord/attribute_assignment.rb:6-23), whose
 * writers can reach the database at assignment (`replace`,
 * collection_association.rb:46-48; `ids_writer`, :61-83; has_one's displacing
 * writer, has_one_association.rb:59-84).
 *
 * That is why the return type is `Promise<void> | void` and the body is
 * deliberately not `async`: an `async` body would push even a plain column
 * write past the caller's next line, where Ruby's `assign_attributes` has
 * already done it. It answers a promise only when a send owed I/O.
 */
export function assignAttributes(
  model: AttributeAssignment,
  newAttributes: unknown,
): Promise<void> | void {
  if (!respondToEachPair(newAttributes)) {
    throw new ArgumentError(
      `When assigning attributes, you must pass a hash as an argument, ${classOf(newAttributes)} passed.`,
    );
  }
  if (isMassAssignmentEmpty(newAttributes)) return;

  return model._assignAttributes(model.sanitizeForMassAssignment(newAttributes));
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

/**
 * Mirrors: ActiveModel::AttributeAssignment#_assign_attribute
 * (attribute_assignment.rb:67-75)
 *
 *   def _assign_attribute(k, v)
 *     setter = :"#{k}="
 *     public_send(setter, v)
 *   rescue NoMethodError
 *     if respond_to?(setter)
 *       raise
 *     else
 *       attribute_writer_missing(k.to_s, v)
 *     end
 *   end
 *
 * There is no `write_attribute` on this path: the only write Rails makes is
 * `public_send(setter, v)`.
 *
 * That send takes two spellings here because one Ruby method name reaches TS
 * two ways. Rails' generated writer is a real method named `name=`
 * (attributes.rb:92-102) and is reachable by that key; a user-authored
 * `def name=` ported as a TS `set` accessor is the same Ruby method under the
 * spelling docs/ruby-ts-conventions.md gives it, which `findSetter` resolves.
 * The accessor is tried first because Ruby finds a class's own `name=` before
 * the generated methods module's.
 *
 * Ruby reaches the `rescue NoMethodError` arm through
 * AttributeMethods#method_missing (attribute_methods.rb:508-517), which routes
 * a name matching an attribute-method pattern to `attribute_missing` before any
 * NoMethodError escapes — that is how assignment still works after
 * `undefine_attribute_methods`. TS has no `method_missing`, so that dispatch is
 * explicit; a name with no pattern match is the `respond_to?(setter)` false arm
 * and goes to `attribute_writer_missing`. The remaining arm — the setter exists
 * and itself raised NoMethodError, so Rails re-raises at :70-71 — is tracked by
 * `assign-attribute-respond-to-setter-reraise-arm`. Resolving the setter before
 * dispatching means there is no rescue to re-enter: a NoMethodError from inside
 * a setter propagates out of the send above, which is what the re-raise does,
 * but Ruby's `respond_to?` consults the receiver's full method table where the
 * ladder above consults only what it can resolve.
 *
 * @internal Rails-private helper.
 */
export function _assignAttribute(model: AttributeAssignment, k: string, v: unknown): void {
  const setter = `${k}=`;
  const own = findSetter(model, k);
  if (own) {
    own.call(model, v);
    return;
  }
  const generated = (model as unknown as Record<string, unknown>)[setter];
  if (typeof generated === "function") {
    (generated as (this: AttributeAssignment, value: unknown) => void).call(model, v);
    return;
  }
  const match = model.matchedAttributeMethod(setter);
  if (match) {
    model.attributeMissing(match, v);
    return;
  }
  model.attributeWriterMissing(k, v);
}

export interface AttributeAssignment {
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  /** @internal Rails-private helper. */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  matchedAttributeMethod(methodName: string): { proxyTarget: string; attrName: string } | null;
  attributeMissing(match: { proxyTarget: string; attrName: string }, ...args: unknown[]): unknown;
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
 * The JS spelling of `new_attributes.respond_to?(:each_pair)`
 * (attribute_assignment.rb:29). JS has no `each_pair`, so a plain object
 * (prototype `Object.prototype` or null) or a params-style wrapper duck-typing
 * `permitted?`/`to_h` stands in for a Ruby Hash; a Date, Map, Set, Array, or
 * arbitrary class instance has none of Hash's semantics and fails the guard
 * exactly as it does in Ruby.
 *
 * KNOWN GAP: `HashWithIndifferentAccess` is a Hash subclass Rails' guard admits
 * (it inherits `Hash#each_pair`), but trails HWIA stores entries in a private
 * `Map` — so it fails here AND the downstream `_assignAttributes`
 * `Object.entries` loop cannot read it either (a pre-existing silent no-op).
 * Tracked by `assign-attributes-hwia-each-pair`.
 */
function respondToEachPair(attrs: unknown): attrs is Record<string, unknown> {
  if (typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return true;
  return isParamsLikeWrapper(attrs);
}

/**
 * A non-plain object duck-typing the `ActionController::Parameters` surface —
 * the trails analogue of Rails' params wrapper, distinct from a plain hash whose
 * own keys ARE its contents. `respondToEachPair` admits it as hash-like, and
 * `isMassAssignmentEmpty` consults its `empty` (so a plain hash that happens to
 * carry an `empty: <boolean>` attribute is unaffected).
 */
function isParamsLikeWrapper(attrs: object): boolean {
  // `where`/`exists` funnel raw primitives through this path, and
  // `Object.getPrototypeOf` box-coerces them (so a number clears the plain-object
  // gate below) while `in` throws on them outright. A primitive is never a params
  // wrapper — reject before either check.
  if (typeof attrs !== "object" || attrs === null) return false;
  const proto = Object.getPrototypeOf(attrs);
  if (proto === Object.prototype || proto === null) return false;
  const wrapper = attrs as { permitted?: unknown; toH?: unknown };
  return "permitted" in wrapper || typeof wrapper.toH === "function";
}

/** The JS spelling of Ruby's `value.class` name, for the guard's message. */
function classOf(value: unknown): string {
  // Ruby: nil.class #=> NilClass (not "Null").
  if (value === null) return "NilClass";
  if (Array.isArray(value)) return "Array";
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
 * Mirror of Ruby's `RuntimeError` (the default `raise "msg"` class). The
 * activemodel home for the ported root class, so trails-invented guards with no
 * Rails equivalent (serialization.ts' unloaded-collection guard, attribute.ts'
 * `UserProvidedDefault not loaded` module-load-order guard) share one identity
 * and stay `instanceof`-consistent across files.
 */
class RuntimeError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
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

/**
 * Mirror of Ruby's `NotImplementedError`. Raised by abstract base methods
 * that subclasses are required to override — e.g. `Validator#validate` and
 * `EachValidator#validate_each` (activemodel/lib/active_model/validator.rb:123,162).
 */
class NotImplementedError extends globalThis.Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export { ArgumentError, TypeError, NameError, NoMethodError, NotImplementedError, RuntimeError };
