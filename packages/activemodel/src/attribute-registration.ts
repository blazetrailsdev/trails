import { DescendantsTracker, registerSubclass } from "@blazetrails/activesupport";
import { Type } from "./type/value.js";
import { defaultValue } from "./type.js";
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
  _pendingAttributeModifications?: PendingModification[];
  attributeAliases?: Record<string, string>;
  /** @internal Rails-private helper. Mirrors: ClassMethods#resolve_attribute_name */
  resolveAttributeName(name: string): string;

  // The rest of the ClassMethods `extend(Model, …)` installs (see model.ts), so
  // one ported body self-sends the next the way Ruby does.
  attributeTypes(): Record<string, Type>;
  /** @internal Rails-private helper. */
  pendingAttributeModifications(): PendingModification[];
}

// ---------------------------------------------------------------------------
// Pending modification structs
// Mirrors: ActiveModel::AttributeRegistration::ClassMethods private structs
// ---------------------------------------------------------------------------

/**
 * A decorator receives the attribute name and its current type — Ruby's
 * `decorator.call(name, attribute.type)` (attribute_registration.rb:83).
 */
// Nullable return, mirroring Rails' `attribute_set[name] = attribute.with_type(type) if type`
// (attribute_registration.rb:72) — a decorator that answers nil leaves the
// attribute undecorated, which is how conditional decoration is written.
export type AttributeDecorator = (name: string, type: Type) => Type | null | undefined;

/** @internal Rails-private helper. */
export interface PendingModification {
  /** @internal */
  applyTo(attributeSet: AttributeSet): void;
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

  applyTo(attributeSet: AttributeSet): void {
    const existing = attributeSet.getAttribute(this.name);
    attributeSet.set(this.name, existing.withUserDefault(this.default_));
  }
}

/**
 * The class-side receiver `attribute` self-sends on — Rails' `self` inside
 * `AttributeRegistration::ClassMethods`.
 */
export interface AttributeRegistrationHost extends AttributeHostInternals {
  /** @internal */
  resolveTypeName(name: string, options?: Record<string, unknown>): Type;
  /** @internal */
  hookAttributeType(name: string, type: Type): Type;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#attribute
 * (attribute_registration.rb:12-20) — resolves the name, resolves and hooks the
 * type, appends the pending modifications, and resets the default attributes.
 * `ActiveModel::Attributes::ClassMethods#attribute` (attributes.rb:59-62) calls
 * this through `super` and then generates the attribute methods.
 */
export function attribute(
  this: AttributeRegistrationHost,
  name: string,
  // Mirrors Rails' `attribute(name, type = nil, **options)`: the type is
  // optional. When omitted, the attribute keeps its existing (schema-reflected
  // or previously-declared) type and only the default/decorator is applied —
  // backing the `attribute :col, default: "x"` idiom. See
  // activemodel/lib/active_model/attribute_registration.rb:18,55-63.
  typeName?: string | Type | AttributeOptions,
  options?: AttributeOptions,
): void {
  name = this.resolveAttributeName(name);
  if (typeName !== undefined && typeof typeName !== "string" && !(typeName instanceof Type)) {
    options = typeName;
    typeName = undefined;
  }
  const typeProvided = typeName !== undefined;
  // Rails' `attribute(name, type = nil, default: (no_default = true), **options)`
  // (attribute_registration.rb:12) forwards `**options` straight to
  // `resolve_type_name`; the two keys trails names explicitly — `default` and
  // `virtual` — are consumed here, so only the rest reach it.
  const { default: _default, virtual: _virtual, ...typeOptions } = options ?? {};
  // attribute_registration.rb:14-15:
  //   type = resolve_type_name(type, **options) if type.is_a?(Symbol)
  //   type = hook_attribute_type(name, type) if type
  let type: Type | null = null;
  if (typeProvided) {
    type =
      typeName instanceof Type
        ? typeName
        : this.resolveTypeName(
            typeName as string,
            Object.keys(typeOptions).length > 0
              ? (typeOptions as Record<string, unknown>)
              : undefined,
          );
    type = this.hookAttributeType(name, type);
  }

  // attribute_registration.rb:17-18:
  //   pending_attribute_modifications << PendingType.new(name, type) if type || no_default
  //   pending_attribute_modifications << PendingDefault.new(name, default) unless no_default
  // A bare re-declaration (no type, no default) still pushes a PendingType with
  // a nil type so it re-anchors to the attribute's current type at replay; a
  // default-only call pushes only PendingDefault, preserving the existing type.
  const noDefault = options?.default === undefined;
  if (type != null || noDefault) {
    this.pendingAttributeModifications().push(new PendingType(name, type));
  }
  if (!noDefault) {
    this.pendingAttributeModifications().push(new PendingDefault(name, options?.default));
  }

  // Mirrors: Rails reset_default_attributes — invalidate cache on this class
  // and all known subclasses so they recompute on next _defaultAttributes() call.
  resetDefaultAttributes(this);
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#decorate_attributes
 * (attribute_registration.rb:26-30):
 *
 *   def decorate_attributes(names = nil, &decorator)
 *     names = names&.map { |name| resolve_attribute_name(name) }
 *     pending_attribute_modifications << PendingDecorator.new(names, decorator)
 *     reset_default_attributes
 *   end
 *
 * The decoration itself is applied when `_default_attributes` next
 * materializes (attribute_registration.rb:32-36).
 */
export function decorateAttributes(
  this: AttributeHostInternals,
  names: string[] | null,
  decorator: AttributeDecorator,
): void {
  names = names?.map((name) => this.resolveAttributeName(name)) ?? null;

  this.pendingAttributeModifications().push(new PendingDecorator(names, decorator));

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
  if (Object.hasOwn(this, "_cachedAttributeTypes") && this._cachedAttributeTypes) {
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
        return defaultValue();
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  this._cachedAttributeTypes = proxy;
  return proxy;
}

// ---------------------------------------------------------------------------
// Subclass registry
// Mirrors: ActiveSupport::DescendantsTracker used by reset_default_attributes
// ---------------------------------------------------------------------------

type HostAsClass = new (...args: unknown[]) => unknown;

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
  attributeName = this.resolveAttributeName(attributeName);

  const types = this.attributeTypes();
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
  if (!Object.hasOwn(this, "_pendingAttributeModifications")) {
    this._pendingAttributeModifications = [];
  }
  return this._pendingAttributeModifications as PendingModification[];
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#apply_pending_attribute_modifications
 *
 * Ruby's `superclass.respond_to?(:apply_pending_attribute_modifications, true)`
 * (attribute_registration.rb:80) tests for a private method of the module; a TS
 * module function is not a member of the class, so the participation test is
 * the public entry point every AttributeRegistration includer answers.
 *
 * @internal
 */
export function applyPendingAttributeModifications(
  cls: AttributeHostInternals,
  attributeSet: AttributeSet,
): void {
  const superclass = Object.getPrototypeOf(cls) as
    | (AttributeHostInternals & { _defaultAttributes?: unknown })
    | null;
  if (superclass && typeof superclass._defaultAttributes === "function") {
    applyPendingAttributeModifications(superclass, attributeSet);
  }

  for (const modification of pendingAttributeModifications.call(cls)) {
    modification.applyTo(attributeSet);
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
