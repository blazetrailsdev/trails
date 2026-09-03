import {
  Attribute,
  AttributeSet,
  UserProvidedDefault,
  type Type,
  AttributeRegistration,
} from "@blazetrails/activemodel";
import { registerSubclass } from "@blazetrails/activesupport";
import {
  lookup as typeLookup,
  defaultValue as typeDefaultValue,
  adapterNameFrom,
  type AdapterNameSource,
} from "./type.js";
import {
  cachedColumnsHash,
  isSchemaLoaded,
  reloadSchemaFromCache as modelSchemaReloadSchemaFromCache,
} from "./model-schema.js";
import { connectionPool, threadedConnectionFor } from "./connection-handling.js";

type AnyClass = any;

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
    registerSubclass(Object.getPrototypeOf(cacheHost), cacheHost);

    let connection: unknown;
    try {
      connection =
        threadedConnectionFor(cacheHost) ??
        cacheHost._adapter ??
        connectionPool.call(cacheHost).activeConnection;
    } catch {
      connection = undefined;
    }
    const columns: Record<string, unknown> =
      (Object.prototype.hasOwnProperty.call(cacheHost, "_columnsHash")
        ? cacheHost._columnsHash
        : undefined) ??
      cachedColumnsHash(cacheHost) ??
      {};
    const ignored = new Set<string>(cacheHost.ignoredColumns ?? []);
    const attributesHash: Record<string, Attribute> = Object.create(null) as Record<
      string,
      Attribute
    >;
    for (const [name, column] of Object.entries(columns)) {
      if (ignored.has(name)) continue;
      attributesHash[name] = Attribute.fromDatabase(
        name,
        (column as { default?: unknown }).default ?? null,
        typeForColumn.call(cacheHost, connection, column),
      );
    }

    const attributeSet = new AttributeSet(attributesHash);
    AttributeRegistration.ClassMethods.applyPendingAttributeModifications.call(
      cacheHost,
      attributeSet,
    );

    cacheHost._cachedDefaultAttributes = attributeSet;
  }

  return cacheHost._cachedDefaultAttributes;
}

/** @internal */
export function reloadSchemaFromCache(this: AnyClass): void {
  this.resetDefaultAttributesBang();
  modelSchemaReloadSchemaFromCache.call(this);
}

const NO_DEFAULT_PROVIDED = Symbol("NO_DEFAULT_PROVIDED");

/** @internal */
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
      this._defaultAttributes().fetch(name, () => null),
    );
  } else {
    defaultAttribute = Attribute.fromDatabase(name, value, type);
  }
  this._defaultAttributes().set(name, defaultAttribute);
}

/** @internal */
export function resetDefaultAttributes(this: AnyClass): void {
  reloadSchemaFromCache.call(this);
}

/** @internal */
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

/** @internal */
function typeForColumn(this: AnyClass, connection: unknown, column: unknown): Type {
  const lookupCastTypeFromColumn = (
    connection as { lookupCastTypeFromColumn?: (c: unknown) => Type }
  )?.lookupCastTypeFromColumn;
  let type =
    (typeof lookupCastTypeFromColumn === "function"
      ? lookupCastTypeFromColumn.call(connection, column)
      : null) ?? typeDefaultValue();

  if (this.immutableStringsByDefault) {
    const toImmutableString = (type as { toImmutableString?: () => Type }).toImmutableString;
    if (typeof toImmutableString === "function") type = toImmutableString.call(type);
  }

  return this.hookAttributeType((column as { name: string }).name, type);
}
