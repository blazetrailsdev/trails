import { ActiveRecord, Encryption } from "../namespaces.js";
import {
  Concern,
  any,
  isPlainObject,
  kernelArray,
  transformKeys,
} from "@blazetrails/activesupport";
import { Module, extend, hashAref, hashAset, include, isEmpty } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { Relation } from "../relation.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";

export interface SerializableType {
  serialize(data: unknown): unknown;
}

export class ExtendedDeterministicQueries {
  static installSupport(): void {
    prepend(Relation, RelationQueries);
    include(ActiveRecord.Base, CoreQueries);
    prepend(EncryptedAttributeType, ExtendedEncryptableType);
  }
}

export class EncryptedQuery {
  static processArguments(
    owner: any,
    args: unknown[],
    checkForAdditionalValues: boolean,
  ): unknown[] {
    if (owner instanceof Relation) owner = owner.model;

    if (owner.deterministicEncryptedAttributes()?.length === 0) return args;

    let options: Map<string, unknown> | Record<string, unknown>;
    if (
      Array.isArray(args) &&
      (isPlainObject((options = args[0] as typeof options)) || options instanceof Map)
    ) {
      options = transformKeys(
        options as Map<string, unknown>,
        ((key: unknown) => {
          if (Array.isArray(key)) {
            return key.map((k) => String(k));
          } else {
            return String(key);
          }
        }) as (key: string) => string,
      );
      args[0] = options;

      for (let attributeName of owner.deterministicEncryptedAttributes() ?? []) {
        attributeName = String(attributeName);
        const type = owner.typeForAttribute(attributeName) as EncryptedAttributeType;
        let value: unknown;
        if (
          !isEmpty(type.previousTypes) &&
          (value = hashAref(options, attributeName)) != null &&
          value !== false
        ) {
          hashAset(
            options,
            attributeName,
            this.processEncryptedQueryArgument(value, checkForAdditionalValues, type),
          );
        }
      }
    }

    return args;
  }

  private static processEncryptedQueryArgument(
    value: unknown,
    checkForAdditionalValues: boolean,
    type: EncryptedAttributeType,
  ): unknown {
    if (
      checkForAdditionalValues &&
      Array.isArray(value) &&
      value.length > 0 &&
      value[value.length - 1] instanceof AdditionalValue
    ) {
      return value;
    }

    if (typeof value === "string" || Array.isArray(value)) {
      const list = kernelArray(value);
      return [
        ...list,
        ...list.flatMap((eachValue) => {
          if (checkForAdditionalValues && eachValue instanceof AdditionalValue) return [eachValue];
          return this.additionalValuesFor(eachValue, type);
        }),
      ];
    }
    return value;
  }

  /** @internal */
  private static additionalValuesFor(
    value: unknown,
    type: EncryptedAttributeType,
  ): AdditionalValue[] {
    return type.previousTypes.map((additionalType) => new AdditionalValue(value, additionalType));
  }
}

export const RelationQueries: Module = new Module((mod) => {
  mod.defineMethod("where", function (this: any, ...args: unknown[]): unknown {
    return RelationQueries.superMethod(this, "where")!(
      ...EncryptedQuery.processArguments(this, args, true),
    );
  });

  mod.defineMethod("isExists", function (this: any, ...args: unknown[]): unknown {
    return RelationQueries.superMethod(this, "isExists")!(
      ...EncryptedQuery.processArguments(this, args, true),
    );
  });

  mod.defineMethod("scopeForCreate", function (this: any): Record<string, unknown> {
    if (!any(this.model.deterministicEncryptedAttributes() ?? []))
      return RelationQueries.superMethod(this, "scopeForCreate")!() as Record<string, unknown>;

    const scopeAttributes = RelationQueries.superMethod(this, "scopeForCreate")!() as Record<
      string,
      unknown
    >;
    const wheres = this.whereValuesHash();

    for (let attributeName of this.model.deterministicEncryptedAttributes()) {
      attributeName = String(attributeName);
      const values = wheres[attributeName];
      if (Array.isArray(values) && values.slice(1).every((v) => v instanceof AdditionalValue)) {
        scopeAttributes[attributeName] = values[0];
      }
    }

    return scopeAttributes;
  });
});

export const CoreQueries = new Module() as Module & { ClassMethods: Module };
extend(CoreQueries, Concern);

export function findBy(this: any, ...args: unknown[]): unknown {
  return CoreQueries.ClassMethods.superMethod(this, "findBy")!(
    ...EncryptedQuery.processArguments(this, args, false),
  );
}
CoreQueries.ClassMethods = new Module((mod) => mod.defineMethod("findBy", findBy));

export class AdditionalValue {
  readonly value: unknown;
  readonly type: SerializableType;

  constructor(value: unknown, type: SerializableType) {
    this.type = type;
    this.value = this.process(value);
  }

  /** @internal */
  private process(value: unknown): unknown {
    return this.type.serialize(value);
  }
}

export const ExtendedEncryptableType: Module = new Module((mod) => {
  mod.defineMethod("serialize", function (this: object, data: unknown): unknown {
    if (data instanceof AdditionalValue) {
      return data.value;
    } else {
      return ExtendedEncryptableType.superMethod(this, "serialize")!(data);
    }
  });
});

Encryption.ExtendedDeterministicQueries = ExtendedDeterministicQueries;
