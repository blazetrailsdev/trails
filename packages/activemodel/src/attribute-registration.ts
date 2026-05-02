import { DescendantsTracker } from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";

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
    typeName: string,
    options?: { default?: unknown; virtual?: boolean; userProvidedDefault?: boolean },
  ): void;
  _defaultAttributes(): AttributeSet;
  decorateAttributes(names: string[] | null, decorator: (name: string, type: Type) => Type): void;
  attributeTypes(): Record<string, Type>;
  typeForAttribute(name: string): Type;
}

export type AttributeRegistration = AttributeRegistrationClassMethods;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAttributeHost = any;

// ---------------------------------------------------------------------------
// Pending modification structs
// Mirrors: ActiveModel::AttributeRegistration::ClassMethods private structs
// ---------------------------------------------------------------------------

/** @internal Rails-private helper. */
export interface PendingModification {
  /** @internal */
  applyTo(attributeSet: AttributeSet): void;
}

/** @internal Rails-private helper. */
export class PendingType implements PendingModification {
  constructor(
    readonly name: string,
    readonly type: Type,
  ) {}

  /** @internal */
  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withType(this.type));
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

/** @internal Rails-private helper. */
export class PendingDecorator implements PendingModification {
  constructor(
    readonly names: string[] | null,
    readonly decorator: (name: string, type: Type) => Type,
  ) {}

  /** @internal */
  applyTo(attributeSet: AttributeSet): void {
    const targets = this.names ?? attributeSet.keys();
    for (const name of targets) {
      const existing = attributeSet.getAttribute(name);
      const newType = this.decorator(name, existing.type);
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

/**
 * Register cls as a direct subclass of its prototype-chain superclass so
 * resetDefaultAttributes() can cascade to it.
 *
 * Delegates to DescendantsTracker (WeakRef-backed, dedup'd) — the same
 * infrastructure Rails uses via ActiveSupport::DescendantsTracker. Rails
 * registers via the `inherited` hook; we register lazily on the first
 * _defaultAttributes() call instead (same effect: only classes that have
 * a cache worth invalidating are tracked).
 *
 * Mirrors: ActiveSupport::DescendantsTracker registration triggered by
 * Class.inherited in Rails.
 */
export function registerWithSuperclass(cls: AnyAttributeHost): void {
  const superclass = Object.getPrototypeOf(cls);
  if (!superclass || superclass === Function.prototype) return;
  // Only register if the superclass participates in the attribute system.
  if (!("_attributeDefinitions" in superclass)) return;
  DescendantsTracker.registerSubclass(superclass, cls);
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
export function resetDefaultAttributes(cls: AnyAttributeHost): void {
  resetDefaultAttributesBang.call(cls);
  for (const sub of DescendantsTracker.subclasses(cls)) {
    resetDefaultAttributes(sub);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectPendingModifications(cls: AnyAttributeHost): PendingModification[] {
  if (!cls || cls === Function.prototype || !cls._pendingAttributeModifications) return [];
  const superMods = collectPendingModifications(Object.getPrototypeOf(cls));
  const own = Object.prototype.hasOwnProperty.call(cls, "_pendingAttributeModifications")
    ? (cls._pendingAttributeModifications as PendingModification[])
    : [];
  return [...superMods, ...own];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#apply_pending_attribute_modifications
 *
 * @internal
 */
export function applyPendingAttributeModifications(
  cls: AnyAttributeHost,
  attributeSet: AttributeSet,
): void {
  for (const mod of collectPendingModifications(cls)) {
    mod.applyTo(attributeSet);
  }
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Push a type declaration onto the pending-modification queue.
 * Called internally by attribute() implementations.
 *
 * Mirrors: the PendingType push inside ActiveModel::AttributeRegistration#attribute
 */
export function pushPendingType(cls: AnyAttributeHost, name: string, type: Type): void {
  pendingAttributeModifications.call(cls).push(new PendingType(name, type));
}

/**
 * Push a default declaration onto the pending-modification queue.
 * Called internally by attribute() implementations.
 *
 * Mirrors: the PendingDefault push inside ActiveModel::AttributeRegistration#attribute
 */
export function pushPendingDefault(cls: AnyAttributeHost, name: string, value: unknown): void {
  pendingAttributeModifications.call(cls).push(new PendingDefault(name, value));
}

/**
 * Push a decorator onto the pending-modification queue.
 * Called by decorateAttributes and AR's applyPendingEncryptions.
 *
 * Mirrors: the PendingDecorator push inside ActiveModel::AttributeRegistration#decorate_attributes
 */
export function pushPendingDecorator(
  cls: AnyAttributeHost,
  names: string[] | null,
  decorator: (name: string, type: Type) => Type,
): void {
  pendingAttributeModifications.call(cls).push(new PendingDecorator(names, decorator));
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#_default_attributes
 *
 * Seeds an empty AttributeSet and replays all pending attribute modifications
 * from the class hierarchy. The result is cached.
 *
 * AR overrides this to seed from columnsHash first, then replay.
 */
export function _defaultAttributes(this: AnyAttributeHost): AttributeSet {
  if (!this._cachedDefaultAttributes) {
    // Register with our superclass so resetDefaultAttributes() cascades to us
    // when the superclass gains new attribute declarations. Mirrors the
    // ActiveSupport::DescendantsTracker registration that Rails does via
    // the `inherited` hook; we do it lazily here instead.
    registerWithSuperclass(this);
    const attributeSet = new AttributeSet(new Map<string, Attribute>());
    applyPendingAttributeModifications(this, attributeSet);
    this._cachedDefaultAttributes = attributeSet;
  }
  return this._cachedDefaultAttributes;
}

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
  this: AnyAttributeHost,
  names: string[] | null,
  decorator: (name: string, type: Type) => Type,
): void {
  // Push to pending queue so _defaultAttributes replays in declaration order.
  pushPendingDecorator(this, names, decorator);

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
      const newType = decorator(name, def.type);
      if (newType) defs.set(name, { ...def, type: newType });
    }
  }

  resetDefaultAttributes(this);
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#attribute_types
 *
 * Rails: @attribute_types ||= _default_attributes.cast_types.tap { |h| h.default = Type.default_value }
 * Wraps the cast-types record in a Proxy so unknown keys return a fallback
 * ValueType — same effect as Rails setting `hash.default = Type.default_value`.
 */
export function attributeTypes(this: AnyAttributeHost): Record<string, Type> {
  const cast = _defaultAttributes.call(this).castTypes();
  return new Proxy(cast, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && !Object.hasOwn(target, prop)) {
        return typeRegistry.lookup("value");
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#type_for_attribute
 *
 * Rails: attribute_types[attribute_name]
 * Delegates to attributeTypes — single codepath. Returns a fallback ValueType
 * for unknown names (never null), matching Rails' Type.default_value behavior.
 */
export function typeForAttribute(this: AnyAttributeHost, name: string): Type {
  const resolved = resolveAttributeName.call(this, name);
  return attributeTypes.call(this)[resolved];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#pending_attribute_modifications
 *
 * Lazily initializes the own-class pending-modification queue and returns it.
 *
 * @internal Rails-private helper.
 */
export function pendingAttributeModifications(this: AnyAttributeHost): PendingModification[] {
  if (!Object.prototype.hasOwnProperty.call(this, "_pendingAttributeModifications")) {
    this._pendingAttributeModifications = [];
  }
  return this._pendingAttributeModifications as PendingModification[];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#reset_default_attributes!
 *
 * Clears only the cached state on this class (no subclass cascade).
 * resetDefaultAttributes() calls this first, then recurses.
 *
 * @internal Rails-private helper.
 */
export function resetDefaultAttributesBang(this: AnyAttributeHost): void {
  this._cachedDefaultAttributes = null;
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
export function resolveAttributeName(this: AnyAttributeHost, name: string): string {
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
  this: AnyAttributeHost,
  name: string,
  _options?: Record<string, unknown>,
): Type {
  return typeRegistry.lookup(name);
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#hook_attribute_type
 *
 * Extension point for other modules (e.g. AR encryption) to decorate a
 * type immediately after resolution. Base implementation is a pass-through.
 *
 * @internal Rails-private helper.
 */
export function hookAttributeType(this: AnyAttributeHost, _attribute: string, type: Type): Type {
  return type;
}
