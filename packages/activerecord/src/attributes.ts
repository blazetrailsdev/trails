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
  defaultValue as typeDefaultValue,
  resetDefaultAttributes as amResetDefaultAttributes,
} from "@blazetrails/activemodel";
// The pending queue is private on ActiveModel (attribute_registration.rb:77);
// only `attribute` (:17) pushes onto it. `define_attribute` reaches the same
// queue from ActiveRecord, so it imports the queue accessor and the pending
// classes off the defining module rather than the package's public barrel.
import {
  PendingDefault,
  PendingType,
  pendingAttributeModifications,
} from "@blazetrails/activemodel/attribute-registration";
import { registerSubclass } from "@blazetrails/activesupport";
import { encryptionHooks } from "./encryption-hooks.js";
import { lookup as typeLookup, adapterNameFrom, type AdapterNameSource } from "./type.js";
import {
  cachedColumnsHash,
  isSchemaLoaded,
  pendingAttributeDeclarationQ,
  schemaStaleAgainstAncestors,
} from "./model-schema.js";

type AnyClass = any;

interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue?: unknown;
  limit?: number | null;
  /** Declared via `attribute(name, type, { virtual: true })` — not DB-backed. */
  virtual?: boolean;
  /**
   * For `source:"schema"` defs, the `tableName` the columns were reflected
   * against. A non-STI subclass that overrides `_tableName` and declares an
   * `attribute()` before reflecting forks (clones) its ancestor's map, copying
   * the ancestor's schema defs — which describe a *different* table. Recording
   * the reflected table lets `ensureSchemaLoaded` distinguish those foreign
   * defs from ones reflected against this class's own table.
   */
  reflectedTable?: string;
  /**
   * The bare `type_for_column` result for this column, before any decoration
   * was baked into `type`. `_defaultAttributes` seeds from this so the
   * pending-decorator replay is the ONLY thing that wraps — mirroring Rails,
   * which seeds from `type_for_column` (attributes.rb:241-245).
   */
  reflectedColumnType?: Type;
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
  const { default: defaultValue = NO_DEFAULT, userProvidedDefault = true } = options;

  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }

  const existing: AttributeDefinition | undefined = this._attributeDefinitions.get(name);
  const resolvedDefault = defaultValue === NO_DEFAULT ? existing?.defaultValue : defaultValue;

  this._attributeDefinitions.set(name, {
    // Spread existing to preserve metadata fields (reflectedTable, virtual, etc.)
    // that other code paths (resetColumnInformation, schema reflection) rely on.
    ...existing,
    name,
    type: castType,
    defaultValue: resolvedDefault ?? null,
    ...(options.limit != null ? { limit: options.limit } : {}),
  });

  // Rails stores nothing for `user_provided_default:`; it forwards it to
  // `define_default_attribute`'s `from_user:`, which picks the Attribute
  // subclass (attributes.rb:229-238,277-291). Queueing the declaration only
  // when it IS user-provided is that same fork: the replay applies
  // `with_user_default` (cast), a `from_user: false` def stays a column seed.
  if (userProvidedDefault) {
    pendingAttributeModifications.call(this).push(new PendingType(name, castType));
    if (defaultValue !== NO_DEFAULT) {
      pendingAttributeModifications
        .call(this)
        .push(new PendingDefault(name, resolvedDefault ?? null));
    }
  }

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
 * Rails' column-seed-then-replay: seeds every real DB column via
 * `Attribute.fromDatabase(name, column.default, type)` (so the default flows
 * through `deserialize`), then replays the pending-modification queue —
 * user-declared `attribute()` PendingType/PendingDefault entries and
 * `decorate_attributes` PendingDecorators (e.g. enums) — on top. A user
 * type-override on a real column (an enum) therefore keeps the FromDatabase
 * attribute and its deserialized default. User-declared attributes that are NOT
 * DB columns seed from `_attributeDefinitions`: with a default via
 * `withUserDefault` (cast), without one via `fromDatabase(null, type)` — the
 * latter required for `LockingType`, whose `deserialize(null)` returns 0.
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
  if (!isSchemaLoaded.call(this) && !this.abstractClass && this.tableName) {
    try {
      this.columnsHash();
    } catch {
      // TableNotSpecified / no cache entry — keep the synthesized view.
    }
  }

  const cacheHost = this;

  if (
    !Object.prototype.hasOwnProperty.call(cacheHost, "_cachedDefaultAttributes") ||
    !cacheHost._cachedDefaultAttributes ||
    schemaStaleAgainstAncestors(cacheHost)
  ) {
    // Stands in for Ruby's `inherited` hook, which populates the
    // DescendantsTracker `reset_default_attributes` recurses over
    // (activemodel/lib/active_model/attribute_registration.rb:88-91); JS has no
    // class-definition hook (CLAUDE.md, "Module mixins").
    registerSubclass(Object.getPrototypeOf(cacheHost), cacheHost);

    // Phase 1: seed schema columns via `Attribute.fromDatabase`, mirroring Rails'
    // `columns_hash.transform_values { Attribute.from_database(col.name, col.default, type) }`.
    // A real DB column — even one carrying a user type-override (e.g. an enum) —
    // seeds from_database with the column's raw default so the default flows
    // through `deserialize`, not `cast`; the user override is layered back on in
    // phase 2 (a bare `attribute(name)` PendingType keeps the FromDatabase
    // wrapper, `decorate_attributes` swaps the type). User-declared attributes
    // that are NOT DB columns seed from `_attributeDefinitions`: with a default
    // via withUserDefault (cast), without one via fromDatabase(null) — the latter
    // matters for LockingType, where deserialize(null) → 0.
    // `undefined` = the schema cache has no entry for this table (not reflected
    // yet); `{}` = reflected and genuinely columnless. The seed below must tell
    // them apart, so keep the miss rather than folding it into an empty hash.
    const cachedColumns = cachedColumnsHash(cacheHost);
    const columns = cachedColumns ?? {};
    const defs: Map<string, AttributeDefinition> = cacheHost._attributeDefinitions;
    const attributesHash = new Map<string, Attribute>();
    // Rails seeds phase 1 from `columns_hash` alone (attributes.rb:241-245) and
    // the non-column declarations arrive with the phase-2 replay, so a column
    // holds its schema position even under an `attribute` override.
    const orderedDefNames = [
      ...Object.keys(columns).filter((name) => defs.has(name)),
      ...[...defs.keys()].filter((name) => columns[name] === undefined),
    ];
    for (const name of orderedDefNames) {
      const def = defs.get(name)!;
      const column = columns[name];
      if (column !== undefined || !pendingAttributeDeclarationQ(cacheHost, name)) {
        // Rails' `columns_hash.transform_values { Attribute.from_database(name,
        // column.default, type_for_column(connection, column)) }`
        // (attributes.rb:241-245) — a user type-override on a real column (an
        // enum, `serialize`, `encrypts`) is layered back on in phase 2.
        //
        // Seed from the BARE reflected column type, not `def.type` — trails
        // eagerly bakes decorations into `def.type` (a back-compat convenience
        // Rails lacks), and phase 2 replays those same decorators, so seeding
        // from `def.type` applies each one twice.
        const seedType = def.reflectedColumnType ?? def.type;
        const defaultValue = column !== undefined ? column.default : def.defaultValue;
        attributesHash.set(name, Attribute.fromDatabase(name, defaultValue ?? null, seedType));
      } else if (def.defaultValue != null) {
        const base = Attribute.withCastValue(name, null, def.type);
        attributesHash.set(name, base.withUserDefault(def.defaultValue));
      } else if (def.type !== typeDefaultValue()) {
        attributesHash.set(name, Attribute.fromDatabase(name, null, def.type));
      } else if (cachedColumns === undefined) {
        // Deviation: Rails resolves `columns_hash` synchronously before
        // `_default_attributes` (attributes.rb:241-250), so a decorator branching
        // on `subtype == Type.default_value` (enum.rb:240) never has to tell "no
        // such column" from trails' "not reflected yet". A schema-cache MISS is
        // that state — not an empty hash (a reflected columnless table must still
        // raise) and not `!_schemaLoaded` (the warm-cache probe above stamps the
        // flag even when the reflection yielded nothing, which is how PG got
        // here). A non-singleton `value` stands in until the table reflects; once
        // it has, an absent name is genuinely absent and stays out of the set, as
        // Rails' columns-only seed leaves it.
        attributesHash.set(name, Attribute.fromDatabase(name, null, typeLookup("value")));
      }
    }

    // Phase 2: replay user-declared attribute() calls from the pending queue.
    // These always win over schema columns, matching Rails' ordering guarantee.
    // Mirrors: apply_pending_attribute_modifications(attribute_set)
    const attributeSet = new AttributeSet(attributesHash);
    applyPendingAttributeModifications(cacheHost, attributeSet);

    cacheHost._cachedDefaultAttributes = attributeSet;
  }

  return cacheHost._cachedDefaultAttributes;
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
export function resolveTypeName(
  this: AnyClass,
  name: string,
  options?: Record<string, unknown>,
): Type {
  return typeLookup(name, {
    ...options,
    adapter: adapterNameFrom(this as unknown as AdapterNameSource),
  });
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
