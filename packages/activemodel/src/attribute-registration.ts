import { DescendantsTracker, registerSubclass } from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import type { AttributeOptions } from "./attributes.js";

/**
 * AttributeRegistration mixin — provides the static attribute() method
 * and attribute type registration.
 *
 * Mirrors: ActiveModel::AttributeRegistration
 *
 * In Rails this is a module that handles the class-level attribute
 * declaration API. Model already implements this via Model.attribute().
 */
export interface AttributeRegistrationClassMethods {
  attribute(
    name: string,
    typeName?: string | Type | AttributeOptions,
    options?: AttributeOptions,
  ): void;
  _defaultAttributes(): AttributeSet;
  decorateAttributes(names: string[] | null, decorator: AttributeDecorator): void;
  attributeTypes(): Record<string, Type>;
  typeForAttribute(name: string, block?: () => Type): Type;
}

export type AttributeRegistration = AttributeRegistrationClassMethods;

export interface AttributeHostInternals {
  _cachedDefaultAttributes?: AttributeSet | null;
  _cachedAttributeTypes?: Record<string, Type> | null;
  _attributesBuilder?: unknown;
  _attributeDefinitions?: Map<
    string,
    { name: string; type?: Type; virtual?: boolean; userProvidedDefault?: boolean }
  >;
  _pendingAttributeModifications?: PendingModification[];
  _attributeAliases?: Record<string, string>;
  /** @internal Rails-private helper. Mirrors: ClassMethods#resolve_attribute_name */
  resolveAttributeName(name: string): string;
}

// ---------------------------------------------------------------------------
// Pending modification structs
// Mirrors: ActiveModel::AttributeRegistration::ClassMethods private structs
// ---------------------------------------------------------------------------

/**
 * A decorator receives the attribute name and its current type, and optionally
 * the *materializing* class (`host`) — the class whose AttributeSet is being
 * built. Rails' `decorate_attributes` block resolves against that class's
 * attributes, so a superclass's decorator replayed into a subclass sees the
 * subclass's columns. trails threads `host` through so a decorator (e.g. enum's
 * "Undeclared attribute type" check) can key off the materializing subclass
 * rather than the class the decorator was declared on.
 */
export type AttributeDecorator = (name: string, type: Type, host?: unknown) => Type;

/** @internal Rails-private helper. */
export interface PendingModification {
  /** @internal */
  applyTo(attributeSet: AttributeSet, host?: unknown): void;
}

/** @internal Rails-private helper. */
export class PendingType implements PendingModification {
  constructor(
    readonly name: string,
    // Nullable, mirroring Rails' `PendingType` whose `type` is nil for a bare
    // `attribute(:col)` re-declaration. apply_to falls back to the attribute's
    // current type (`type || attribute.type`), keeping the existing type.
    readonly type: Type | null,
  ) {}

  /** @internal */
  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withType(this.type ?? existing.type));
  }
}

/** @internal Rails-private helper. */
export class PendingDefault implements PendingModification {
  constructor(
    readonly name: string,
    readonly default_: unknown,
  ) {}

  /** @internal */
  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withUserDefault(this.default_));
  }
}

/**
 * Depth counter set while a PendingDecorator replays during
 * `_default_attributes` materialization. trails also applies decorators eagerly
 * to `_attributeDefinitions` at declaration time (a back-compat convenience Rails
 * lacks); a decorator that must mirror Rails' replay-only behavior — e.g. the
 * enum decorator's "Undeclared attribute type" raise, which Rails fires inside
 * its `decorate_attributes` block only on materialization — consults
 * `isDecoratorReplay()` to run solely on the deferred replay, not the eager pass.
 */
let _decoratorReplayDepth = 0;

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#decorate_attributes
 *
 * Pushes a PendingDecorator onto the modification queue so it replays in the
 * correct order during _defaultAttributes (after any PendingType entries that
 * precede it). Also updates _attributeDefinitions immediately so backward-compat
 * reads (typeForAttribute, columnForAttribute) and double-decoration guards
 * see the decorated type without waiting for _defaultAttributes to be rebuilt.
 */
export function decorateAttributes(
  this: AttributeHostInternals,
  names: string[] | null,
  decorator: AttributeDecorator,
): void {
  names = names?.map((name) => this.resolveAttributeName(name)) ?? null;

  // Push to pending queue so _defaultAttributes replays in declaration order.
  pendingAttributeModifications.call(this).push(new PendingDecorator(names, decorator));

  // Also apply immediately to _attributeDefinitions for backward compat and
  // so guards like `def.type instanceof EncryptedAttributeType` work without
  // forcing a _defaultAttributes rebuild.
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }
  const defs = this._attributeDefinitions as Map<string, { name: string; type: Type }>;
  const targetNames = names ?? Array.from(defs.keys());
  for (const name of targetNames) {
    const def = defs.get(name);
    if (def) {
      const newType = decorator(name, def.type, this);
      if (newType) defs.set(name, { ...def, type: newType });
    }
  }

  resetDefaultAttributes(this);
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#_default_attributes
 *
 * Seeds an empty AttributeSet and replays all pending attribute modifications
 * from the class hierarchy. The result is cached.
 *
 * AR overrides this to seed from columnsHash first, then replay.
 */
export function _defaultAttributes(this: AttributeHostInternals): AttributeSet {
  if (!this._cachedDefaultAttributes) {
    // Stands in for Ruby's `inherited` hook, which populates the
    // DescendantsTracker that `reset_default_attributes` recurses over
    // (attribute_registration.rb:88-91); JS has no class-definition hook
    // (CLAUDE.md, "Module mixins").
    registerSubclass(Object.getPrototypeOf(this) as HostAsClass, this as unknown as HostAsClass);
    const attributeSet = new AttributeSet(new Map<string, Attribute>());
    applyPendingAttributeModifications(this, attributeSet);
    this._cachedDefaultAttributes = attributeSet;
  }
  return this._cachedDefaultAttributes;
}

/** @internal Rails-private helper. */
export class PendingDecorator implements PendingModification {
  constructor(
    readonly names: string[] | null,
    readonly decorator: AttributeDecorator,
  ) {}

  /** @internal */
  applyTo(attributeSet: AttributeSet, host?: unknown): void {
    const targets = this.names ?? attributeSet.keys();
    for (const name of targets) {
      const existing = attributeSet.getAttribute(name);
      const newType = inDecoratorReplay(() => this.decorator(name, existing.type, host));
      if (newType) {
        attributeSet.set(name, existing.withType(newType));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Subclass registry
// Mirrors: ActiveSupport::DescendantsTracker used by reset_default_attributes
// ---------------------------------------------------------------------------

type HostAsClass = new (...args: unknown[]) => unknown;

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#attribute_types
 *
 * Rails: @attribute_types ||= _default_attributes.cast_types.tap { |h| h.default = Type.default_value }
 * Wraps the cast-types record in a Proxy so unknown keys return a fallback
 * ValueType — same effect as Rails setting `hash.default = Type.default_value`.
 *
 * Memoized on the class (own-property guarded) mirroring Rails' `||=`, and
 * invalidated through resetDefaultAttributesBang wherever `_default_attributes`
 * is reset — so both the cast-types record and its fallback Proxy are built once
 * per schema/attribute revision rather than rebuilt on every call.
 */
export function attributeTypes(this: AttributeHostInternals): Record<string, Type> {
  if (
    Object.prototype.hasOwnProperty.call(this, "_cachedAttributeTypes") &&
    this._cachedAttributeTypes
  ) {
    return this._cachedAttributeTypes;
  }
  // Dispatch through `this._defaultAttributes()` (not the bare AM function) so a
  // subclass override — notably ActiveRecord's column-inclusive
  // `_defaultAttributes`, which reflects schema columns into the set — is
  // honored. Mirrors Rails calling the polymorphic `_default_attributes`.
  const host = this as AttributeHostInternals & { _defaultAttributes(): AttributeSet };
  const cast = host._defaultAttributes().castTypes();
  const proxy = new Proxy(cast, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !Object.hasOwn(target, prop)) {
        return typeRegistry.lookup("value");
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  this._cachedAttributeTypes = proxy;
  return proxy;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#type_for_attribute
 *
 * Rails: attribute_types[attribute_name]
 * Delegates to attributeTypes — single codepath. Returns a fallback ValueType
 * for unknown names (never null), matching Rails' Type.default_value behavior.
 */
export function typeForAttribute(
  this: AttributeHostInternals,
  attributeName: string,
  block?: () => Type,
): Type {
  attributeName = resolveAttributeName.call(this, attributeName);

  const types = attributeTypes.call(this);
  if (block) {
    // Ruby `attribute_types.fetch(attribute_name, &block)` — the block runs only
    // when the hash has no such KEY, so the `Type.default_value` hash default
    // (attribute_registration.rb:37) does not pre-empt it.
    return Object.hasOwn(types, attributeName) ? types[attributeName] : block();
  }
  return types[attributeName];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#pending_attribute_modifications
 *
 * Lazily initializes the own-class pending-modification queue and returns it.
 *
 * @internal Rails-private helper.
 */
export function pendingAttributeModifications(this: AttributeHostInternals): PendingModification[] {
  if (!Object.prototype.hasOwnProperty.call(this, "_pendingAttributeModifications")) {
    this._pendingAttributeModifications = [];
  }
  return this._pendingAttributeModifications as PendingModification[];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#apply_pending_attribute_modifications
 *
 * @internal
 */
export function applyPendingAttributeModifications(
  cls: AttributeHostInternals,
  attributeSet: AttributeSet,
  // The class whose AttributeSet is being materialized, threaded down the
  // recursion so a superclass's PendingDecorator resolves against the subclass
  // it is replaying into — the `host` thread documented on AttributeDecorator.
  host: AttributeHostInternals = cls,
): void {
  // Ruby `superclass.respond_to?(:apply_pending_attribute_modifications, true)`
  // (attribute_registration.rb:80). The module function is not a member of the
  // class in TS, so the participation test is the public entry point every
  // AttributeRegistration includer answers.
  const superclass = Object.getPrototypeOf(cls) as
    | (AttributeHostInternals & { _defaultAttributes?: unknown })
    | null;
  if (superclass && typeof superclass._defaultAttributes === "function") {
    applyPendingAttributeModifications(superclass, attributeSet, host);
  }

  for (const modification of pendingAttributeModifications.call(cls)) {
    modification.applyTo(attributeSet, host);
  }
}

/**
 * Clear the cached default AttributeSet on this class and all known
 * subclasses, so the next call to _defaultAttributes() recomputes.
 *
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#reset_default_attributes
 * which calls reset_default_attributes! then recurses via subclasses.each.
 *
 * @internal
 */
export function resetDefaultAttributes(cls: AttributeHostInternals): void {
  resetDefaultAttributesBang.call(cls);
  for (const sub of DescendantsTracker.subclasses(cls as unknown as HostAsClass)) {
    resetDefaultAttributes(sub as unknown as AttributeHostInternals);
  }
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#reset_default_attributes!
 *
 * Clears only the cached state on this class (no subclass cascade).
 * resetDefaultAttributes() calls this first, then recurses.
 *
 * @internal Rails-private helper.
 */
export function resetDefaultAttributesBang(this: AttributeHostInternals): void {
  this._cachedDefaultAttributes = null;
  // Invalidate the memoized attribute_types record + fallback Proxy in the same
  // cascade that clears _default_attributes, mirroring Rails resetting
  // @attribute_types alongside @default_attributes.
  this._cachedAttributeTypes = null;
  // _attributesBuilder is an AR-specific derived cache. Shadow with undefined
  // so prototype-chain lookup never returns a stale superclass builder after
  // this class's attributes change. STI subclasses remove the shadow after
  // writing the fresh builder; AM-only classes carry it harmlessly.
  this._attributesBuilder = undefined;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#resolve_attribute_name
 *
 * Returns the attribute name as-is. Rails calls name.to_s here; our public
 * API already enforces string, so no coercion is needed.
 *
 * @internal Rails-private helper.
 */
export function resolveAttributeName(this: AttributeHostInternals, name: string): string {
  return name;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#resolve_type_name
 *
 * Looks up a registered Type by symbolic name.
 *
 * @internal Rails-private helper.
 */
export function resolveTypeName(
  this: AttributeHostInternals,
  name: string,
  options?: Record<string, unknown>,
): Type {
  return typeRegistry.lookup(name, options);
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#hook_attribute_type
 *
 * Extension point for other modules (e.g. AR encryption) to decorate a
 * type immediately after resolution. Base implementation is a pass-through.
 *
 * @internal Rails-private helper.
 */
export function hookAttributeType(
  this: AttributeHostInternals,
  _attribute: string,
  type: Type,
): Type {
  return type;
}

/** True while a PendingDecorator is replaying during materialization. @internal */
export function isDecoratorReplay(): boolean {
  return _decoratorReplayDepth > 0;
}

/**
 * Run `fn` in decorator-replay context, so `isDecoratorReplay()` reports true.
 *
 * Mirrors: the replay performed by
 * ActiveModel::AttributeRegistration::PendingDecorator#apply_to. Every path that
 * replays a pending decorator MUST go through this, or decorators gated on
 * replay context (notably enum's undeclared-type check) silently change behavior.
 *
 * @internal
 */
function inDecoratorReplay<T>(fn: () => T): T {
  _decoratorReplayDepth++;
  try {
    return fn();
  } finally {
    _decoratorReplayDepth--;
  }
}
