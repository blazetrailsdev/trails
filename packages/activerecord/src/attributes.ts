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
  UserProvidedDefault,
  type Type,
  applyPendingAttributeModifications,
  resetDefaultAttributes as amResetDefaultAttributes,
} from "@blazetrails/activemodel";
import { registerSubclass } from "@blazetrails/activesupport";
import { lookup as typeLookup, adapterNameFrom, type AdapterNameSource } from "./type.js";
import { cachedColumnsHash, isSchemaLoaded } from "./model-schema.js";
import { connectionPool, threadedConnectionFor } from "./connection-handling.js";

type AnyClass = any;

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
    options?: { default?: unknown; userProvidedDefault?: boolean },
  ): void;
  _defaultAttributes(): AttributeSet;
}

/**
 * Lower-level attribute registration that accepts a resolved type object
 * directly, bypassing string-based type lookup.
 *
 * Mirrors: ActiveRecord::Attributes::ClassMethods#define_attribute
 * (attributes.rb:231-239):
 *
 *   def define_attribute(name, cast_type, default: NO_DEFAULT_PROVIDED, user_provided_default: true)
 *     attribute_types[name] = cast_type
 *     define_default_attribute(name, default, cast_type, from_user: user_provided_default)
 *   end
 */
export function defineAttribute(
  this: AnyClass,
  name: string,
  castType: Type,
  options: { default?: unknown; userProvidedDefault?: boolean } = {},
): void {
  const { default: default_ = NO_DEFAULT_PROVIDED, userProvidedDefault = true } = options;

  this.attributeTypes()[name] = castType;
  defineDefaultAttribute.call(this, name, default_, castType, {
    fromUser: userProvidedDefault,
  });
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

// attributes.rb:274-275 — `NO_DEFAULT_PROVIDED = Object.new`, a private
// constant read only by `define_default_attribute`.
const NO_DEFAULT_PROVIDED = Symbol("NO_DEFAULT_PROVIDED");

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
  { fromUser }: { fromUser: boolean },
): void {
  let defaultAttribute: Attribute;
  if (value === NO_DEFAULT_PROVIDED) {
    defaultAttribute = this._defaultAttributes().getAttribute(name).withType(type);
  } else if (fromUser) {
    defaultAttribute = new UserProvidedDefault(
      name,
      value,
      type,
      // Ruby `_default_attributes.fetch(name.to_s) { nil }` — the block runs
      // only when the key is absent, so a stored attribute is passed through.
      this._defaultAttributes().isKey(name) ? this._defaultAttributes().getAttribute(name) : null,
    );
  } else {
    defaultAttribute = Attribute.fromDatabase(name, value, type);
  }
  this._defaultAttributes().set(name, defaultAttribute);
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
