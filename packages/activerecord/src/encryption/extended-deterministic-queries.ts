import { Concern, any, isPlainObject, prepend, transformKeys } from "@blazetrails/activesupport";
import { Module, extend, include, isEmpty } from "@blazetrails/ruby-compat";
import { Relation } from "../relation.js";
import { ADDITIONAL_VALUE_BRAND, EncryptedAttributeType } from "./encrypted-attribute-type.js";

export interface SerializableType {
  serialize(data: unknown): unknown;
}

export class ExtendedDeterministicQueries {
  private static _installed = false;

  static installSupport(targets: {
    Relation: {
      prototype: {
        where: (...args: any[]) => unknown;
        exists: (...args: any[]) => unknown;
        scopeForCreate: (...args: any[]) => unknown;
      };
    };
    Base: new (...args: any[]) => unknown;
    EncryptedAttributeType: { prototype: { serialize: (...args: any[]) => unknown } };
  }): void {
    if (this._installed) return;

    const relProto = targets.Relation.prototype as unknown as Record<
      string,
      (...args: any[]) => unknown
    >;
    const eatProto = targets.EncryptedAttributeType.prototype as unknown as Record<
      string,
      (...args: any[]) => unknown
    >;
    const missing: string[] = [];
    if (typeof relProto.where !== "function") missing.push("Relation.prototype.where");
    if (typeof relProto.exists !== "function") missing.push("Relation.prototype.exists");
    if (typeof relProto.scopeForCreate !== "function")
      missing.push("Relation.prototype.scopeForCreate");
    if (typeof eatProto.serialize !== "function")
      missing.push("EncryptedAttributeType.prototype.serialize");
    if (missing.length > 0) {
      throw new Error(
        `ExtendedDeterministicQueries.installSupport: missing target method(s): ${missing.join(", ")}`,
      );
    }

    prepend(relProto, {
      where(super_, ...args) {
        return RelationQueries.where.call(this, super_ as (...args: any[]) => unknown, args);
      },
      exists(super_, ...args) {
        return RelationQueries.isExists.call(this, super_ as (...args: any[]) => unknown, args);
      },
      scopeForCreate(super_) {
        return RelationQueries.scopeForCreate.call(this, super_ as (...args: any[]) => unknown);
      },
    });
    include(targets.Base, CoreQueries);
    prepend(eatProto, {
      serialize(super_, data) {
        return ExtendedEncryptableType.serialize((v: unknown) => super_.call(this, v), data);
      },
    });

    this._installed = true;
  }
}

export class EncryptedQuery {
  static processArguments(
    owner: any,
    args: unknown[],
    checkForAdditionalValues: boolean,
  ): unknown[] {
    if (owner instanceof Relation) owner = owner.model;

    if (owner.deterministicEncryptedAttributes()?.size === 0) return args;

    let options: unknown;
    if (Array.isArray(args) && (isPlainObject((options = args[0])) || options instanceof Map)) {
      const hash = transformKeys(
        options as Map<string, unknown>,
        ((key: unknown) => {
          if (Array.isArray(key)) {
            return key.map((k) => String(k));
          } else {
            return String(key);
          }
        }) as (key: string) => string,
      ) as Map<string, unknown> | Record<string, unknown>;
      args[0] = hash;

      for (let attributeName of owner.deterministicEncryptedAttributes() ?? []) {
        attributeName = String(attributeName);
        const type = owner.typeForAttribute(attributeName) as EncryptedAttributeType;
        let value: unknown;
        if (
          !isEmpty(type.previousTypes) &&
          (value = hash instanceof Map ? hash.get(attributeName) : hash[attributeName]) != null &&
          value !== false
        ) {
          value = this.processEncryptedQueryArgument(value, checkForAdditionalValues, type);
          if (hash instanceof Map) hash.set(attributeName, value);
          else hash[attributeName] = value;
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
      const list = Array.isArray(value) ? value : [value];
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

export class RelationQueries {
  static where(this: any, originalWhere: (...args: any[]) => unknown, args: unknown[]): unknown {
    return originalWhere.call(this, ...EncryptedQuery.processArguments(this, args, true));
  }

  static isExists(
    this: any,
    originalExists: (...args: any[]) => unknown,
    args: unknown[],
  ): unknown {
    return originalExists.call(this, ...EncryptedQuery.processArguments(this, args, true));
  }

  static scopeForCreate(
    this: any,
    originalScopeForCreate: (...args: any[]) => unknown,
  ): Record<string, unknown> {
    if (!any([...(this.model.deterministicEncryptedAttributes() ?? [])]))
      return originalScopeForCreate.call(this) as Record<string, unknown>;

    const scopeAttributes = originalScopeForCreate.call(this) as Record<string, unknown>;
    const wheres = this.whereValuesHash();

    for (let attributeName of this.model.deterministicEncryptedAttributes()) {
      attributeName = String(attributeName);
      const values = wheres[attributeName];
      if (Array.isArray(values) && values.slice(1).every((v) => v instanceof AdditionalValue)) {
        scopeAttributes[attributeName] = values[0];
      }
    }

    return scopeAttributes;
  }
}

export const CoreQueries = new Module() as Module & { ClassMethods: Module };
extend(CoreQueries, Concern);
CoreQueries.ClassMethods = new Module((mod) => {
  mod.defineMethod("findBy", function (this: any, ...args: unknown[]) {
    return mod.superMethod(this, "findBy")!(...EncryptedQuery.processArguments(this, args, false));
  });
});

export class AdditionalValue {
  readonly value: unknown;
  readonly type: SerializableType;
  /** @noRailsEquivalent PERMANENT */
  readonly [ADDITIONAL_VALUE_BRAND] = true;

  constructor(value: unknown, type: SerializableType) {
    this.type = type;
    this.value = this.process(value);
  }

  /** @internal */
  private process(value: unknown): unknown {
    return this.type.serialize(value);
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    return String(this.value);
  }

  /** @noRailsEquivalent PERMANENT */
  valueOf(): unknown {
    return this.value;
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.toPrimitive](hint: string): string | number {
    if (hint === "number") {
      const n = Number(this.value);
      return Number.isNaN(n) ? 0 : n;
    }
    return String(this.value);
  }
}

export class ExtendedEncryptableType {
  static serialize(originalSerialize: (data: unknown) => unknown, data: unknown): unknown {
    if (data instanceof AdditionalValue) {
      return data.value;
    }
    return originalSerialize(data);
  }
}
