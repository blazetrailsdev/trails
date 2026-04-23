/**
 * The Attributes module — the `attribute` class method API for defining
 * typed attributes on models.
 *
 * In Rails this is a class method mixed in via ActiveSupport::Concern.
 * In our codebase, Base.attribute() is a static method on Base.
 *
 * Mirrors: ActiveRecord::Attributes
 */

import {
  Attribute,
  AttributeSet,
  type Type,
  applyPendingAttributeModifications,
} from "@blazetrails/activemodel";
import { isStiSubclass, getStiBase } from "./inheritance.js";
import type { Base } from "./base.js";
import { applyPendingEncryptions } from "./encryption.js";

type AnyClass = any;

interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue?: unknown;
  userProvided?: boolean;
  source?: "user" | "schema";
}

/**
 * Static interface for the Attributes module.
 *
 * Mirrors: ActiveRecord::Attributes (class-level methods)
 */
export interface Attributes {
  attribute(name: string, type: string, options?: { default?: unknown }): void;
  defineAttribute(
    name: string,
    castType: Type,
    options?: { default?: unknown; userProvidedDefault?: boolean },
  ): void;
  _defaultAttributes(): AttributeSet;
}

const NO_DEFAULT = Symbol("NO_DEFAULT");

/**
 * Lower-level attribute registration that accepts a resolved type object
 * directly, bypassing string-based type lookup. Used by adapters after
 * `lookupCastTypeFromColumn` and by code that already has a type in hand.
 *
 * Mirrors: ActiveRecord::Attributes::ClassMethods#define_attribute
 */
export function defineAttribute(
  this: AnyClass,
  name: string,
  castType: Type,
  options: { default?: unknown; userProvidedDefault?: boolean } = {},
): void {
  // STI subclasses share the base's _attributeDefinitions — route to the
  // base to avoid forking a subclass-local map that drifts from the base.
  if (isStiSubclass(this as typeof Base)) {
    const stiBase = getStiBase(this as typeof Base);
    (stiBase as AnyClass).defineAttribute(name, castType, options);
    return;
  }

  const { default: defaultValue = NO_DEFAULT, userProvidedDefault = true } = options;

  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }

  const existing: AttributeDefinition | undefined = this._attributeDefinitions.get(name);
  const resolvedDefault = defaultValue === NO_DEFAULT ? existing?.defaultValue : defaultValue;

  this._attributeDefinitions.set(name, {
    // Spread existing to preserve metadata fields (source, virtual, etc.)
    // that other code paths (resetColumnInformation, schema reflection) rely on.
    ...existing,
    name,
    type: castType,
    defaultValue: resolvedDefault ?? null,
    userProvided: userProvidedDefault,
    source: userProvidedDefault ? "user" : "schema",
  });

  this._cachedDefaultAttributes = null;
  this._attributesBuilder = undefined;
  applyPendingEncryptions(this);

  // Install prototype accessor so the attribute is readable/writable by name,
  // matching what applyColumnsHash does for schema-reflected columns.
  if (this.prototype) {
    if (name === "id") {
      // Let Base.prototype.id (the CPK-aware getter) take precedence.
      if (Object.prototype.hasOwnProperty.call(this.prototype, "id")) {
        delete (this.prototype as Record<string, unknown>)["id"];
      }
    } else if (!Object.prototype.hasOwnProperty.call(this.prototype, name)) {
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
}

/**
 * Build the AttributeSet that seeds every new record's `_attributes`.
 *
 * Mirrors: ActiveRecord::Attributes::ClassMethods#_default_attributes
 *
 * Seeds from `_attributeDefinitions` (all entries — the equivalent of Rails'
 * `columns_hash`) then replays user-declared `attribute()` calls from the
 * pending-modification queue. Schema entries are built with
 * `Attribute.fromDatabase`; direct `defineAttribute()` entries use
 * `withCastValue`/`withUserDefault`. Matches Rails' two-phase approach:
 * `columns_hash` seed → `apply_pending_attribute_modifications`.
 */
export function _defaultAttributes(this: AnyClass): AttributeSet {
  // For STI subclasses, delegate to the STI base so cache invalidation
  // from Base.attribute/defineAttribute (always routed to the base) is coherent.
  const cacheHost = isStiSubclass(this as typeof Base)
    ? (getStiBase(this as typeof Base) as AnyClass)
    : this;

  if (!cacheHost._cachedDefaultAttributes) {
    // Phase 1: seed from _attributeDefinitions (all entries — schema-reflected
    // columns and direct defineAttribute() calls). Schema entries use
    // Attribute.fromDatabase; user entries use withCastValue + withUserDefault.
    // Mirrors: columns_hash.transform_values { Attribute.from_database(...) }
    // (our _attributeDefinitions is the equivalent of columns_hash since both
    // schema and user-direct entries live there).
    const defs: Map<string, AttributeDefinition> = cacheHost._attributeDefinitions;
    const attrMap = new Map<string, Attribute>();
    for (const [name, def] of defs) {
      const schemaColumn =
        (def.source ?? (def.userProvided === false ? "schema" : "user")) === "schema";
      if (def.defaultValue != null) {
        if (schemaColumn) {
          attrMap.set(name, Attribute.fromDatabase(name, def.defaultValue, def.type));
        } else {
          const base = Attribute.withCastValue(name, null, def.type);
          attrMap.set(name, base.withUserDefault(def.defaultValue));
        }
      } else {
        attrMap.set(name, Attribute.withCastValue(name, null, def.type));
      }
    }

    // Phase 2: replay user-declared attribute() calls from the pending queue.
    // These always win over schema columns, matching Rails' ordering guarantee.
    // Mirrors: apply_pending_attribute_modifications(attribute_set)
    const attributeSet = new AttributeSet(attrMap);
    applyPendingAttributeModifications(cacheHost, attributeSet);

    cacheHost._cachedDefaultAttributes = attributeSet;
  }
  return cacheHost._cachedDefaultAttributes;
}
