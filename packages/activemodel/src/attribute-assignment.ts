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

/** @internal Rails-private helper. */
export function _assignAttributes(
  model: AttributeAssignment,
  attributes: Record<string, unknown>,
): void {
  for (const [k, v] of Object.entries(attributes)) {
    void model._assignAttribute(k, v);
  }
}

/**
 * Mirrors: `alias attributes= assign_attributes` (attribute_assignment.rb:36) —
 * the alias sits immediately under the method it aliases, as it does in Ruby.
 * A TS `set` accessor cannot be awaited and the aliased write path can owe I/O
 * (`replace`, collection_association.rb:46-48; `ids_writer`, :61-83; has_one's
 * displacing writer, has_one_association.rb:59-84), so the alias keeps the
 * Rails name in a `setX()` method (CLAUDE.md § "Fidelity is the job").
 */
export function setAttributes(
  model: AttributeAssignment,
  newAttributes: unknown,
): Promise<void> | void {
  return assignAttributes(model, newAttributes);
}

export function attributeWriterMissing(
  model: AttributeAssignment,
  name: string,
  _value: unknown,
): void {
  throw new UnknownAttributeError(model, name);
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
 * `public_send(setter, v)`, and the branch it takes when that fails is decided
 * in the `rescue`, not before the send.
 *
 * Ruby reaches that rescue through AttributeMethods#method_missing
 * (attribute_methods.rb:508-517), which routes a name matching an
 * attribute-method pattern to `attribute_missing` before any NoMethodError
 * escapes — that is how assignment still works after
 * `undefine_attribute_methods`. TS has no `method_missing`, so that dispatch is
 * explicit inside the send below, in the same position Ruby runs it.
 *
 * `respond_to?` consults the receiver's full method table, including names
 * answered through `respond_to_missing?`, where the lookup below sees only what
 * it can resolve — so a NoMethodError raised from *inside* a matched
 * `attribute_missing` still routes to `attribute_writer_missing` instead of
 * being re-raised at :70-71. Tracked by
 * `assign-attribute-respond-to-setter-reraise-arm`.
 *
 * @internal Rails-private helper.
 */
export function _assignAttribute(
  model: AttributeAssignment,
  k: string,
  v: unknown,
): Promise<void> | void {
  const setter = `${k}=`;
  try {
    const method = publicMethod(model, setter);
    if (method) {
      const result: unknown = method.call(model, v);
      return result instanceof Promise ? (result as Promise<void>) : undefined;
    }
    const match = model.matchedAttributeMethod(setter);
    if (match) {
      model.attributeMissing(match, v);
      return;
    }
    throw new NoMethodError(
      `undefined method '${setter}' for an instance of ${model.constructor.name}`,
    );
  } catch (error) {
    if (!(error instanceof NoMethodError)) throw error;
    if (publicMethod(model, setter)) {
      throw error;
    } else {
      model.attributeWriterMissing(k, v);
    }
  }
}

/**
 * Ruby's `Object#public_method` for `setter` — the lookup both
 * `public_send(setter, v)` and `respond_to?(setter)` consult above.
 *
 * One Ruby method name reaches TS two ways, which is the single genuine JS
 * shortcoming on this path. Rails' generated writer is a real method named
 * `name=` (attributes.rb:92-102) and is reachable by that key; a user-authored
 * `def name=` ported as a TS `set` accessor is the same Ruby method under the
 * spelling docs/ruby-ts-conventions.md gives it, and a `set name(v)` accessor
 * is NOT reachable by the key `"name="`. The accessor is tried first because
 * Ruby finds a class's own `name=` before the generated methods module's.
 *
 * The accessor walk starts at the instance itself (JS analogue of Ruby
 * singleton methods) and stops before `Object.prototype`, so built-in
 * accessors like `__proto__` can't hijack mass assignment. It ignores
 * shadowing data descriptors and get-only accessors: Ruby looks up `name=` as
 * its own method, independent of any `name` getter.
 */
function publicMethod(
  model: AttributeAssignment,
  setter: string,
): ((this: AttributeAssignment, value: unknown) => unknown) | null {
  const key = setter.slice(0, -1);
  let obj: object | null = model;
  while (obj && obj !== Object.prototype) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (desc && typeof desc.set === "function") {
      return desc.set as (this: AttributeAssignment, value: unknown) => unknown;
    }
    obj = Object.getPrototypeOf(obj);
  }
  const generated = (model as unknown as Record<string, unknown>)[setter];
  if (typeof generated === "function") {
    return generated as (this: AttributeAssignment, value: unknown) => unknown;
  }
  return null;
}

export interface AttributeAssignment {
  attributeWriterMissing(name: string, value: unknown): void;
  /** @internal */
  sanitizeForMassAssignment(attributes: Record<string, unknown>): Record<string, unknown>;
  /** @internal Rails-private helper. */
  _assignAttributes(attributes: Record<string, unknown>): Promise<void> | void;
  /** @internal Rails-private helper. */
  _assignAttribute(k: string, v: unknown): Promise<void> | void;
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
