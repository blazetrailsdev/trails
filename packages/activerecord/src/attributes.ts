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
} from "@blazetrails/activemodel";
// The pending queue is private on ActiveModel (attribute_registration.rb:77);
// only `attribute` (:17) pushes onto it. `define_attribute` reaches the same
// queue from ActiveRecord, so it imports the queue accessor and the pending
// classes off the defining module rather than the package's public barrel.
import {
  type PendingModification,
  pendingAttributeModifications,
} from "@blazetrails/activemodel/attribute-registration";
import { registerSubclass } from "@blazetrails/activesupport";
import { encryptionHooks } from "./encryption-hooks.js";
import { lookup as typeLookup, adapterNameFrom, type AdapterNameSource } from "./type.js";
import { cachedColumnsHash, isSchemaLoaded } from "./model-schema.js";
import { connectionPool, threadedConnectionFor } from "./connection-handling.js";

type AnyClass = any;

interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue?: unknown;
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

const NO_DEFAULT_PROVIDED = Symbol("NO_DEFAULT_PROVIDED");

/**
 * `define_default_attribute`'s body (attributes.rb:277-291), carried on the
 * pending-modification queue so it replays with the rest of it.
 *
 * Rails writes the result straight into `_default_attributes` because nothing
 * rebuilds that set behind it; trails rebuilds it from `columns_hash` plus the
 * queue on every `reset_default_attributes`, so an eager write is dropped by
 * the next rebuild. Deferring is the only shape that survives, and it keeps
 * the three arms and their order exactly as Rails writes them.
 */
class PendingDefinedDefault implements PendingModification {
  constructor(
    readonly name: string,
    readonly value: unknown,
    readonly type: Type,
    readonly fromUser: boolean,
  ) {}

  applyTo(attributeSet: AttributeSet): void {
    let defaultAttribute: Attribute;
    if (this.value === NO_DEFAULT_PROVIDED) {
      defaultAttribute = attributeSet.getAttribute(this.name).withType(this.type);
    } else if (this.fromUser) {
      defaultAttribute = attributeSet
        .getAttribute(this.name)
        .withType(this.type)
        .withUserDefault(this.value);
    } else {
      defaultAttribute = Attribute.fromDatabase(this.name, this.value, this.type);
    }
    attributeSet.set(this.name, defaultAttribute);
  }
}

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
    ...existing,
    name,
    type: castType,
    defaultValue: resolvedDefault ?? null,
    ...(options.limit != null ? { limit: options.limit } : {}),
  });

  defineDefaultAttribute.call(
    this,
    name,
    defaultValue === NO_DEFAULT ? NO_DEFAULT_PROVIDED : (resolvedDefault ?? null),
    castType,
    userProvidedDefault,
  );

  amResetDefaultAttributes(this);
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
 * (attributes.rb:241-252):
 *
 *   @default_attributes ||= begin
 *     attributes_hash = with_connection do |connection|
 *       columns_hash.transform_values do |column|
 *         ActiveModel::Attribute.from_database(column.name, column.default, type_for_column(connection, column))
 *       end
 *     end
 *     attribute_set = ActiveModel::AttributeSet.new(attributes_hash)
 *     apply_pending_attribute_modifications(attribute_set)
 *     attribute_set
 *   end
 *
 * The seed is `columns_hash` alone; every user declaration arrives with the
 * pending-modification replay, so a `attribute :col, :integer` on a real column
 * keeps the column's position and its deserialized default while the replayed
 * `PendingType` swaps the type.
 */
export function _defaultAttributes(this: AnyClass): AttributeSet {
  if (!isSchemaLoaded.call(this) && !this.abstractClass && this.tableName) {
    try {
      this.columnsHash();
    } catch {}
  }

  const cacheHost = this;

  if (
    !Object.prototype.hasOwnProperty.call(cacheHost, "_cachedDefaultAttributes") ||
    !cacheHost._cachedDefaultAttributes
  ) {
    // Stands in for Ruby's `inherited` hook, which populates the
    // DescendantsTracker `reset_default_attributes` recurses over
    // (activemodel/lib/active_model/attribute_registration.rb:88-91); JS has no
    // class-definition hook (CLAUDE.md, "Module mixins").
    registerSubclass(Object.getPrototypeOf(cacheHost), cacheHost);

    // Ruby's `with_connection` block. Both probes are connection-free reads (no
    // `.connection`), so the hot `new Model()` path never forces a permanent
    // checkout; a model with no leased connection reflects no columns and is
    // built from the pending replay alone.
    let connection: unknown;
    try {
      connection =
        threadedConnectionFor(cacheHost) ??
        cacheHost._adapter ??
        connectionPool.call(cacheHost).activeConnection;
    } catch {
      connection = undefined;
    }
    // Rails reads `columns_hash` — the memo `load_schema!` settled
    // (model_schema.rb:592-594) — so prefer this class's own memo and fall back
    // to the warm schema cache only for a class that has not reflected yet.
    const columns: Record<string, unknown> =
      (Object.prototype.hasOwnProperty.call(cacheHost, "_columnsHash")
        ? cacheHost._columnsHash
        : undefined) ??
      cachedColumnsHash(cacheHost) ??
      {};
    const ignored = new Set<string>(cacheHost.ignoredColumns ?? []);
    const attributesHash = new Map<string, Attribute>();
    for (const [name, column] of Object.entries(columns)) {
      // `load_schema!` drops the ignored columns before `@columns_hash` is
      // stashed (model_schema.rb:592-594), so they never reach the seed.
      if (ignored.has(name)) continue;
      attributesHash.set(
        name,
        Attribute.fromDatabase(
          name,
          (column as { default?: unknown }).default ?? null,
          typeForColumn.call(cacheHost, connection, column),
        ),
      );
    }

    const attributeSet = new AttributeSet(attributesHash);
    applyPendingAttributeModifications(cacheHost, attributeSet);

    cacheHost._cachedDefaultAttributes = attributeSet;
  }

  return cacheHost._cachedDefaultAttributes;
}

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
 * (attributes.rb:277-291).
 */
function defineDefaultAttribute(
  this: AnyClass,
  name: string,
  value: unknown,
  type: Type,
  fromUser: boolean,
): void {
  pendingAttributeModifications
    .call(this)
    .push(new PendingDefinedDefault(name, value, type, fromUser));
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
 * (attributes.rb:300-302) — `hook_attribute_type(column.name, super)`, whose
 * `super` is ActiveRecord::ModelSchema::ClassMethods#type_for_column
 * (model_schema.rb:622-629): the adapter's cast type for the column, run
 * through the immutable-string conversion. TS cannot spell `super` across
 * modules, so the two bodies are inlined in Rails order. Falls back to the
 * `value` type when no connection is available to look the column up.
 */
function typeForColumn(this: AnyClass, connection: unknown, column: unknown): Type {
  const lookupCastTypeFromColumn = (
    connection as { lookupCastTypeFromColumn?: (c: unknown) => Type }
  )?.lookupCastTypeFromColumn;
  let type =
    (typeof lookupCastTypeFromColumn === "function"
      ? lookupCastTypeFromColumn.call(connection, column)
      : null) ?? typeLookup("value");

  // Only mutable StringType responds to toImmutableString, mirroring Ruby's
  // `type.respond_to?(:to_immutable_string)` guard.
  if (this.immutableStringsByDefault) {
    const toImmutableString = (type as { toImmutableString?: () => Type }).toImmutableString;
    if (typeof toImmutableString === "function") type = toImmutableString.call(type);
  }

  return this.hookAttributeType((column as { name: string }).name, type);
}
