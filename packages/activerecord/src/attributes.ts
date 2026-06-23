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
  resetDefaultAttributes as amResetDefaultAttributes,
  registerWithSuperclass,
} from "@blazetrails/activemodel";
import { isStiSubclass, getStiBase } from "./inheritance.js";
import { encryptionHooks } from "./encryption-hooks.js";
import { lookup as typeLookup } from "./type.js";

type AnyClass = any;

interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue?: unknown;
  userProvided?: boolean;
  source?: "user" | "schema";
  limit?: number | null;
  /** Declared via `attribute(name, type, { virtual: true })` — not DB-backed. */
  virtual?: boolean;
}

/**
 * Static interface for the Attributes module.
 *
 * Mirrors: ActiveRecord::Attributes (class-level methods)
 */
export interface Attributes {
  attribute(
    name: string,
    type: string,
    options?: { default?: unknown; limit?: number | null },
  ): void;
  defineAttribute(
    name: string,
    castType: Type,
    options?: { default?: unknown; userProvidedDefault?: boolean; limit?: number | null },
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
  options: { default?: unknown; userProvidedDefault?: boolean; limit?: number | null } = {},
): void {
  // STI subclasses share the base's _attributeDefinitions — route to the
  // base to avoid forking a subclass-local map that drifts from the base.
  if (isStiSubclass(this)) {
    const stiBase = getStiBase(this);
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
    ...(options.limit != null ? { limit: options.limit } : {}),
  });

  amResetDefaultAttributes(this);
  // A newly declared attribute may be virtual (no DB column); force the next
  // ensureSchemaLoaded to re-run the virtual reconciliation (model-schema.ts
  // reconcileVirtualAttributes) so it isn't skipped by the one-shot guard.
  this._virtualAttributesReconciled = false;
  encryptionHooks.applyPendingEncryptions(this);

  // Route prototype-accessor generation through defineAttributeMethods rather
  // than installing inline here. Rails generates attribute methods lazily via
  // `define_attribute_methods`; we mirror that single generation path by
  // invalidating the generated-methods flag and regenerating, so the accessor
  // for the just-declared attribute (and the `id`-skip) is handled in one place.
  if (this.prototype) {
    const klass = this as unknown as {
      _attributeMethodsGenerated?: boolean;
      defineAttributeMethods?: () => boolean;
    };
    klass._attributeMethodsGenerated = false;
    klass.defineAttributeMethods?.();
  }
}

/**
 * Build the AttributeSet that seeds every new record's `_attributes`.
 *
 * Mirrors: ActiveRecord::Attributes::ClassMethods#_default_attributes
 *
 * Seeds from `_attributeDefinitions` then replays user-declared `attribute()`
 * calls from the pending-modification queue. Entries with an explicit default
 * use `Attribute.fromDatabase` (schema) or `withUserDefault` (user-declared).
 * Entries without a default use `Attribute.fromDatabase(null, type)` for all
 * attributes — mirroring Rails' `columns_hash.transform_values { from_database }`.
 * Using `fromDatabase` (rather than `withCastValue`) means the type's
 * `deserialize(null)` is called, which is required for `LockingType` to return
 * 0 instead of null for new records that have no lock column default.
 */
export function _defaultAttributes(this: AnyClass): AttributeSet {
  // Reflect the (always-warm, RFC 0031) schema cache into `_attributeDefinitions`
  // before building, so real columns — notably the `id` PK — are seeded even
  // when the model is first constructed without a query (e.g. `new Car({name})`,
  // where no STI `type` key drives the usual reflect-on-`new` path). Without
  // this the strict `writeFromUser` raises on the post-INSERT `id` write-back.
  // `columnsHash` reads the warm cache directly (and reconciles the definitions),
  // which the bare `loadSchema` cache-sync path does not reliably do for
  // dynamically-defined / STI models. A genuinely tableless model reflects
  // nothing and falls through to the attribute-synthesized view as before.
  //
  // Gated on `!_schemaLoaded`: once the schema has been reflected the real
  // columns are already in `_attributeDefinitions`, so skipping avoids both the
  // redundant work and — importantly — the `.connection` access inside
  // `columnsHash`, which would otherwise permanently check out a connection on
  // every construction under `permanent_connection_checkout` = disallowed.
  if (!this._schemaLoaded && !this.abstractClass && this.tableName) {
    try {
      this.columnsHash();
    } catch {
      // TableNotSpecified / no cache entry — keep the synthesized view.
    }
  }

  // For STI subclasses, seed the shared (schema-reflected) set on the STI base
  // so cache invalidation from Base.attribute/defineAttribute (routed to the
  // base) stays coherent across siblings. The subclass's own declarations are
  // layered on afterwards (see below).
  const stiSubclass = isStiSubclass(this);
  const cacheHost = stiSubclass ? (getStiBase(this) as AnyClass) : this;

  if (!cacheHost._cachedDefaultAttributes) {
    // Register cacheHost with its superclass so resetDefaultAttributes()
    // cascades here when the superclass gains new attribute declarations.
    registerWithSuperclass(cacheHost);

    // Phase 1: seed from _attributeDefinitions (all entries — schema-reflected
    // columns and direct defineAttribute() calls).
    // For entries with a default: schema columns use fromDatabase, user-declared
    // columns use withCastValue + withUserDefault (preserving user semantics).
    // For entries without a default: all entries use fromDatabase(null, type),
    // mirroring Rails' columns_hash.transform_values { Attribute.from_database(...) }.
    // The fromDatabase path matters for LockingType: deserialize(null) → 0.
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
        // Seed via fromDatabase(null, type), mirroring Rails'
        // columns_hash.transform_values { Attribute.from_database(col.name, col.default, type) }.
        // This matters for LockingType: deserialize(null) → 0, not null.
        attrMap.set(name, Attribute.fromDatabase(name, null, def.type));
      }
    }

    // Phase 2: replay user-declared attribute() calls from the pending queue.
    // These always win over schema columns, matching Rails' ordering guarantee.
    // Mirrors: apply_pending_attribute_modifications(attribute_set)
    const attributeSet = new AttributeSet(attrMap);
    applyPendingAttributeModifications(cacheHost, attributeSet);

    cacheHost._cachedDefaultAttributes = attributeSet;
  }

  const baseSet = cacheHost._cachedDefaultAttributes;
  if (!stiSubclass) return baseSet;

  // STI subclass: Rails memoizes `_default_attributes` per class, walking the
  // full superclass chain of pending modifications — so a subclass-only
  // `attribute :extra_size` is present in that subclass's default set even
  // though it isn't a column on the shared table. trails shares the base's
  // schema-reflected set; when this subclass declares nothing extra (the common
  // STI case — `class Reply < Topic`) we return that set unchanged. Otherwise we
  // layer the subclass's own declarations onto a per-subclass copy.
  //
  // The copy is keyed on the base set's identity so it is transparently rebuilt
  // whenever the base set is reset/re-warmed — caching a cold snapshot would
  // otherwise survive schema load and drop real columns.
  if (collectSubclassPendingCount(this, cacheHost) === 0) return baseSet;
  if (
    Object.prototype.hasOwnProperty.call(this, "_cachedDefaultAttributesBase") &&
    this._cachedDefaultAttributesBase === baseSet &&
    this._cachedDefaultAttributes
  ) {
    return this._cachedDefaultAttributes;
  }
  const subclassSet = baseSet.deepDup();
  applyPendingAttributeModifications(this, subclassSet);
  this._cachedDefaultAttributes = subclassSet;
  this._cachedDefaultAttributesBase = baseSet;
  return subclassSet;
}

/**
 * Count pending attribute modifications declared on the STI subclass chain
 * strictly below the STI base (i.e. modifications the base's shared default
 * set does not already carry).
 */
function collectSubclassPendingCount(sub: AnyClass, stiBase: AnyClass): number {
  let count = 0;
  let cls: AnyClass | null = sub;
  while (cls && cls !== stiBase) {
    if (Object.prototype.hasOwnProperty.call(cls, "_pendingAttributeModifications")) {
      count += (cls._pendingAttributeModifications as unknown[] | undefined)?.length ?? 0;
    }
    cls = Object.getPrototypeOf(cls);
  }
  return count;
}

const NO_DEFAULT_PROVIDED = Symbol("NO_DEFAULT_PROVIDED");

/**
 * @internal
 * Mirrors: ActiveRecord::Attributes::ClassMethods#reload_schema_from_cache
 */
function reloadSchemaFromCache(this: AnyClass): void {
  amResetDefaultAttributes(this);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Attributes::ClassMethods#define_default_attribute
 */
function defineDefaultAttribute(
  this: AnyClass,
  name: string,
  value: unknown,
  type: Type,
  fromUser: boolean,
): void {
  const defaults = _defaultAttributes.call(this);
  let defaultAttr: Attribute;
  if (value === NO_DEFAULT_PROVIDED) {
    defaultAttr = defaults.getAttribute(name).withType(type);
  } else if (fromUser) {
    const existing = defaults.getAttribute(name);
    defaultAttr = existing.withType(type).withUserDefault(value);
  } else {
    defaultAttr = Attribute.fromDatabase(name, value, type);
  }
  defaults.set(name, defaultAttr);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Attributes::ClassMethods#reset_default_attributes
 */
function resetDefaultAttributes(this: AnyClass): void {
  reloadSchemaFromCache.call(this);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Attributes::ClassMethods#resolve_type_name
 */
function resolveTypeName(this: AnyClass, name: string): Type {
  return typeLookup(name);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Attributes::ClassMethods#type_for_column
 */
function typeForColumn(
  this: AnyClass,
  _connection: unknown,
  column: { name: string; type: Type },
): Type {
  return column.type;
}
