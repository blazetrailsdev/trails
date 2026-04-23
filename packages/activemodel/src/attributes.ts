import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";
import { pushPendingType, pushPendingDefault } from "./attribute-registration.js";

export interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue: unknown;
  virtual?: boolean;
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

/**
 * Attributes module contract.
 *
 * Mirrors: ActiveModel::Attributes
 */
export interface Attributes {
  readonly attributes: Record<string, unknown>;
  attributeNames(): string[];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _cachedDefaultAttributes?: any;
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
  });

  // Push to pending-modification queue so _defaultAttributes() replays in
  // the correct order relative to schema-reflected columns (AR) or other
  // pending modifications (AM inheritance).
  // Mirrors: ActiveModel::AttributeRegistration#attribute
  pushPendingType(this, name, type);
  if (options?.default !== undefined) {
    pushPendingDefault(this, name, defaultValue);
  }

  // Mirrors: Rails reset_default_attributes — clear cached AttributeSet
  this._cachedDefaultAttributes = null;

  if (!Object.prototype.hasOwnProperty.call(this.prototype, name)) {
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
