import {
  Attribute,
  AttributeSet,
  UserProvidedDefault,
  type ValueType,
  AttributeRegistration,
} from "@blazetrails/activemodel";
import { registerSubclass } from "@blazetrails/activesupport";
import { block, hashAset, transformValues } from "@blazetrails/ruby-compat";
import { lookup as typeLookup, adapterNameFrom, type AdapterNameSource } from "./type.js";
import {
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

  hashAset(this.attributeTypes(), name, castType);
  defineDefaultAttribute.call(this, name, default_, castType, {
    fromUser: userProvidedDefault,
  });
}

let replayingOverColdSchema = false;

/** @noRailsEquivalent CONVERGEABLE enum-undeclared-type-raise-reads-no-cold-schema-replay-flag */
export function isReplayingOverColdSchema(): boolean {
  return replayingOverColdSchema;
}

/** @inventedArm try — CONVERGEABLE enum-undeclared-type-raise-reads-no-cold-schema-replay-flag */
export function _defaultAttributes(this: AnyClass): AttributeSet {
  return (
    Object.getOwnPropertyDescriptor(this, "_cachedDefaultAttributes")?.value ||
    (this._cachedDefaultAttributes = (() => {
      registerSubclass(Object.getPrototypeOf(this), this);

      const attributesHash = this.connectionPool().withConnectionSync((connection: unknown) =>
        transformValues(
          this.columnsHash() as Record<string, { name: string; default?: unknown }>,
          (column) =>
            Attribute.fromDatabase(
              column.name,
              column.default ?? null,
              typeForColumn.call(this, connection, column),
            ),
        ),
      );

      const attributeSet = new AttributeSet(attributesHash);
      const cold = !isSchemaLoaded.call(this) && !this.abstractClass && !!this.tableName;
      const wasCold = replayingOverColdSchema;
      replayingOverColdSchema = cold;
      try {
        AttributeRegistration.ClassMethods.applyPendingAttributeModifications.call(
          this,
          attributeSet,
        );
      } finally {
        replayingOverColdSchema = wasCold;
      }
      return attributeSet;
    })())
  );
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
      this._defaultAttributes().fetch(
        name,
        block(() => null),
      ),
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
