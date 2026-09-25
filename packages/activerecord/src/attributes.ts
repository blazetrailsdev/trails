import {
  Attribute,
  AttributeSet,
  UserProvidedDefault,
  type ValueType,
  AttributeRegistration,
} from "@blazetrails/activemodel";
import { registerSubclass } from "@blazetrails/activesupport";
import { lookup as typeLookup, adapterNameFrom, type AdapterNameSource } from "./type.js";
import {
  cachedColumnsHash,
  isSchemaLoaded,
  reloadSchemaFromCache as modelSchemaReloadSchemaFromCache,
  typeForColumn as modelSchemaTypeForColumn,
} from "./model-schema.js";

type AnyClass = any;

export interface Attributes {
  attribute(
    name: string,
    type: string,
    options?: { default?: unknown; limit?: number | null },
  ): void;
  defineAttribute(
    name: string,
    castType: ValueType,
    options?: { default?: unknown; userProvidedDefault?: boolean },
  ): void;
  _defaultAttributes(): AttributeSet;
}

export function defineAttribute(
  this: AnyClass,
  name: string,
  castType: ValueType,
  options: { default?: unknown; userProvidedDefault?: boolean } = {},
): void {
  const { default: default_ = NO_DEFAULT_PROVIDED, userProvidedDefault = true } = options;

  this.attributeTypes()[name] = castType;
  defineDefaultAttribute.call(this, name, default_, castType, {
    fromUser: userProvidedDefault,
  });
}

let replayingOverColdSchema = false;

/** @noRailsEquivalent PERMANENT */
export function isReplayingOverColdSchema(): boolean {
  return replayingOverColdSchema;
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

    const reflected: Record<string, unknown> | undefined =
      (Object.prototype.hasOwnProperty.call(cacheHost, "_columnsHash")
        ? cacheHost._columnsHash
        : undefined) ?? cachedColumnsHash(cacheHost);
    const columns: Record<string, unknown> = reflected ?? {};
    const ignored = new Set<string>(cacheHost.ignoredColumns ?? []);
    const buildAttributesHash = (connection: unknown) => {
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
      return attributesHash;
    };
    const attributesHash = cacheHost.connectionPool().withConnectionSync(buildAttributesHash);

    const attributeSet = new AttributeSet(attributesHash);
    const cold =
      reflected === undefined &&
      !isSchemaLoaded.call(cacheHost) &&
      !cacheHost.abstractClass &&
      !!cacheHost.tableName;
    const wasCold = replayingOverColdSchema;
    replayingOverColdSchema = cold;
    try {
      AttributeRegistration.ClassMethods.applyPendingAttributeModifications.call(
        cacheHost,
        attributeSet,
      );
    } finally {
      replayingOverColdSchema = wasCold;
    }

    cacheHost._cachedDefaultAttributes = attributeSet;
  }

  return cacheHost._cachedDefaultAttributes;
}

/** @internal */
export function reloadSchemaFromCache(this: AnyClass, recursive = true): void {
  this.resetDefaultAttributesBang();
  modelSchemaReloadSchemaFromCache.call(this, recursive);
}

const NO_DEFAULT_PROVIDED = Symbol("NO_DEFAULT_PROVIDED");

/** @internal */
function defineDefaultAttribute(
  this: AnyClass,
  name: string,
  value: unknown,
  type: ValueType,
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
): ValueType {
  return typeLookup(name, {
    ...options,
    adapter: adapterNameFrom(this as unknown as AdapterNameSource),
  });
}

/** @internal */
function typeForColumn(this: AnyClass, connection: unknown, column: unknown): ValueType {
  return this.hookAttributeType(
    (column as { name: string }).name,
    modelSchemaTypeForColumn.call(this, connection, column),
  );
}
