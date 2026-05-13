import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import {
  AttrNames,
  attributeMissing,
  defineDirtyAttributeMethods,
  isAttributeMethod as _isAttributeMethod,
  matchedAttributeMethod as _matchedAttributeMethod,
  missingAttribute as _missingAttribute,
  _readAttribute as __readAttribute,
} from "./attribute-methods.js";
import {
  pushPendingType,
  pushPendingDefault,
  resetDefaultAttributes,
} from "./attribute-registration.js";
import { type InstanceHost } from "./attribute-methods.js";

export interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue: unknown;
  virtual?: boolean;
  limit?: number | null;
  /**
   * True when the attribute was declared via `this.attribute(...)` (user code).
   * False when registered from schema reflection (`load_schema`).
   *
   * Mirrors: Rails' `user_provided_default:` keyword on `define_attribute`.
   * The distinction controls how defaults are materialized (user default vs.
   * database default) and whether schema reflection is allowed to overwrite
   * the definition — user-provided defs always win.
   *
   * Optional for backwards compatibility with downstream consumers that
   * construct `AttributeDefinition` directly. When absent, treated as
   * `true` (user-authored) — matching pre-load_schema behavior.
   */
  userProvided?: boolean;
  /** Provenance tag — matches `userProvided` but kept explicit for clarity. */
  source?: "user" | "schema";
}

// ---------------------------------------------------------------------------
// Class methods — Mirrors: ActiveModel::Attributes::ClassMethods
// ---------------------------------------------------------------------------

/**
 * Declare a typed attribute with an optional default.
 *
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute
 *
 * Model.attribute() delegates here. This is the canonical implementation
 * of the class-level `attribute` declaration.
 */
export function attribute(
  this: {
    _attributeDefinitions: Map<string, AttributeDefinition>;
    prototype: object;
    _cachedDefaultAttributes?: AttributeSet | null;
  },
  name: string,
  typeName: string,
  options?: {
    default?: unknown;
    virtual?: boolean;
    /**
     * Mirrors Rails' `user_provided_default:` keyword. Defaults to true —
     * any call to `attribute(...)` is treated as user-authored. Internal
     * schema-reflection paths pass `false` so user-declared attributes win
     * on re-registration.
     */
    userProvidedDefault?: boolean;
    limit?: number | null;
  },
): void {
  const type = typeRegistry.lookup(typeName);
  const userProvided = options?.userProvidedDefault !== false;
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }
  const existing = this._attributeDefinitions.get(name);
  // Preserve the existing defaultValue when no default is explicitly provided,
  // matching Rails' PendingType behavior: with_type only changes the type and
  // leaves the current default/value untouched.
  const defaultValue =
    options?.default !== undefined ? options.default : (existing?.defaultValue ?? null);
  this._attributeDefinitions.set(name, {
    name,
    type,
    defaultValue,
    virtual: options?.virtual,
    userProvided,
    source: userProvided ? "user" : "schema",
    ...(options?.limit != null ? { limit: options.limit } : {}),
  });

  // Push to pending-modification queue so _defaultAttributes() replays in
  // the correct order relative to schema-reflected columns (AR) or other
  // pending modifications (AM inheritance).
  // Mirrors: ActiveModel::AttributeRegistration#attribute
  pushPendingType(this, name, type);
  if (options?.default !== undefined) {
    pushPendingDefault(this, name, defaultValue);
  }

  // Mirrors: Rails reset_default_attributes — invalidate cache on this class
  // and all known subclasses so they recompute on next _defaultAttributes() call.
  resetDefaultAttributes(this);

  // Don't install an accessor if `name` resolves anywhere on the prototype
  // chain (Model.prototype or any ancestor). Otherwise an attribute named
  // e.g. `toJSON` / `asJson` / `freeze` / `attributes` would shadow the
  // framework method on this subclass — JSON.stringify would hit the
  // attribute getter instead of `Model#toJSON`, serialization callers
  // would get the raw value instead of the mixin, etc. The attribute
  // still round-trips via `readAttribute(name)` / `writeAttribute(name,
  // value)`, which operate on `_attributes` directly — callers MUST use
  // those methods for reserved names, NOT direct property access
  // (`instance[name]`) or assignment (`instance[name] = value`). Direct
  // assignment would create an own property on the instance and shadow
  // the framework method per-instance.
  if (!(name in this.prototype)) {
    Object.defineProperty(this.prototype, name, {
      get(this: { readAttribute(n: string): unknown }) {
        return this.readAttribute(name);
      },
      set(this: { writeAttribute(n: string, v: unknown): void }, value: unknown) {
        this.writeAttribute(name, value);
      },
      configurable: true,
    });
  }

  defineDirtyAttributeMethods(this.prototype, name);
}

// ---------------------------------------------------------------------------
// Instance methods — Mirrors: ActiveModel::Attributes instance methods
// ---------------------------------------------------------------------------

/**
 * Build default AttributeSet from class definitions.
 *
 * Mirrors: ActiveModel::AttributeRegistration._default_attributes
 */
export function buildDefaultAttributes(defs: Map<string, AttributeDefinition>): AttributeSet {
  const attrMap = new Map<string, Attribute>();
  for (const [name, def] of defs) {
    const userProvided = def.userProvided ?? true;
    if (def.defaultValue != null) {
      if (userProvided) {
        // Rails: user_provided_default: true → wraps the default so it is
        // cast through the user-type (and procs re-evaluate per instance).
        const base = Attribute.withCastValue(name, null, def.type);
        attrMap.set(name, base.withUserDefault(def.defaultValue));
      } else {
        // Rails: user_provided_default: false → column default comes from
        // the database; use fromDatabase so deserialize is applied.
        attrMap.set(name, Attribute.fromDatabase(name, def.defaultValue, def.type));
      }
    } else {
      attrMap.set(name, Attribute.withCastValue(name, null, def.type));
    }
  }
  return new AttributeSet(attrMap);
}

/**
 * Return all attributes as a plain hash.
 *
 * Mirrors: ActiveModel::Attributes#attributes
 */
export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}

/**
 * Concrete mixin host for `ActiveModel::Attributes`. Rails ships
 * `Attributes` as a module included into a model; in TS this class is
 * the canonical instance-side surface. `Model` composes the same
 * behavior into its own constructor for ergonomic subclassing without
 * forcing inheritance from `Attributes`, but any lighter-weight host
 * that wants the bare attribute machinery can extend this class
 * directly.
 *
 * Mirrors: ActiveModel::Attributes (instance side, attributes.rb:31-160)
 */
export class Attributes {
  _attributes: AttributeSet;

  /**
   * Mirrors: attributes.rb:106-109
   *   def initialize(*) # :nodoc:
   *     @attributes = self.class._default_attributes.deep_dup
   *     super
   *   end
   *
   * The rest parameter mirrors Rails' `(*)` splat: subclasses can
   * forward arbitrary arguments via `super(...args)` even though this
   * base ignores them.
   */
  constructor(..._args: unknown[]) {
    const ctor = this.constructor as { _defaultAttributes?(): AttributeSet };
    this._attributes = ctor._defaultAttributes
      ? ctor._defaultAttributes().deepDup()
      : new AttributeSet();
  }

  /** Mirrors: attributes.rb:131-133 — `def attributes; @attributes.to_hash; end` */
  get attributes(): Record<string, unknown> {
    return this._attributes.toHash();
  }

  /** Mirrors: attributes.rb:146-148 — `def attribute_names; @attributes.keys; end` */
  attributeNames(): string[] {
    return this._attributes.keys();
  }

  /**
   * Mirrors: attribute_methods.rb:520-522 — `attribute_missing(match, ...)`
   * surfaces on Attributes via `include AttributeMethods`. Defined as a
   * prototype method (not a class field) so subclass overrides take
   * effect — class fields would shadow them.
   */
  attributeMissing(match: { proxyTarget: string; attrName: string }, ...args: unknown[]): unknown {
    return attributeMissing.call(this as unknown as Record<string, unknown>, match, ...args);
  }
}

// ---------------------------------------------------------------------------
// Rails privates surfaced by attributes.rb
// ---------------------------------------------------------------------------

/** @internal Rails-private helper. Mirrors: #attribute_method? (via AttributeMethods include) */
export function isAttributeMethod(this: InstanceHost, attrName: string): boolean {
  return _isAttributeMethod.call(this, attrName);
}

/** @internal Rails-private helper. Mirrors: #matched_attribute_method (via AttributeMethods include) */
export function matchedAttributeMethod(
  this: InstanceHost,
  methodName: string,
): { proxyTarget: string; attrName: string } | null {
  return _matchedAttributeMethod.call(this, methodName);
}

/** @internal Rails-private helper. Mirrors: #missing_attribute (via AttributeMethods include) */
export function missingAttribute(this: InstanceHost, attrName: string): never {
  return _missingAttribute.call(this, attrName);
}

/** @internal Rails-private helper. Mirrors: #_read_attribute (via AttributeMethods include) */
export function _readAttribute(this: InstanceHost, attr: string): unknown {
  type ReadAttributeThis = InstanceHost & {
    _attributes?: { fetchValue(name: string): unknown };
    _readAttribute?(name: string): unknown;
  };
  return __readAttribute.call(this as unknown as ReadAttributeThis, attr);
}

type AttributeInstanceHost = { _attributes: AttributeSet };

/**
 * Mirrors: ActiveModel::Attributes#_write_attribute
 *
 * Writes a value into the attribute store via the user-write path (casts
 * through the type's `cast` method before storing).
 *
 * @internal Rails-private helper.
 */
export function _writeAttribute(
  this: AttributeInstanceHost,
  attrName: string,
  value: unknown,
): void {
  this._attributes.writeFromUser(attrName, value);
}

/**
 * Mirrors: ActiveModel::Attributes::ClassMethods#define_method_attribute=
 *
 * In Rails this generates a `canonical_name=` writer via code evaluation.
 * Trails installs writers via Object.defineProperty in `attribute()`, so no
 * code generation is required here. The method exists for API-compare parity
 * and to expose the AttrNames accessor-method computation that Rails uses
 * to derive the writer method name.
 *
 * @internal Rails-private helper.
 */
export function defineMethodAttribute(
  canonicalName: string,
  _options?: { owner?: unknown; as?: string },
): void {
  // Writers are already installed by attribute() via Object.defineProperty.
  // Compute and expose the method name the same way Rails would, for callers
  // that inspect the name (e.g. alias generation paths).
  const { methodName } = AttrNames.defineAttributeAccessorMethod(canonicalName, true);
  void methodName;
}
