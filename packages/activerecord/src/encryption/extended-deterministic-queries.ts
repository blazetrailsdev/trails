import { prepend } from "@blazetrails/activesupport";
import { ADDITIONAL_VALUE_BRAND, EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { encryptedTypeOf } from "./encryptable-record.js";

export interface SerializableType {
  serialize(data: unknown): unknown;
}

export class ExtendedDeterministicQueries {
  private static _installed = false;

  /** @missingRailsCall include — PERMANENT */
  static installSupport(targets: {
    Relation: {
      prototype: {
        where: (...args: any[]) => unknown;
        exists: (...args: any[]) => unknown;
        scopeForCreate: (...args: any[]) => unknown;
      };
    };
    Base: { findBy: (...args: any[]) => unknown };
    EncryptedAttributeType: { prototype: { serialize: (...args: any[]) => unknown } };
  }): void {
    if (this._installed) return;

    const relProto = targets.Relation.prototype as unknown as Record<
      string,
      (...args: any[]) => unknown
    >;
    const baseTarget = targets.Base as unknown as Record<string, (...args: any[]) => unknown>;
    const eatProto = targets.EncryptedAttributeType.prototype as unknown as Record<
      string,
      (...args: any[]) => unknown
    >;
    const missing: string[] = [];
    if (typeof relProto.where !== "function") missing.push("Relation.prototype.where");
    if (typeof relProto.exists !== "function") missing.push("Relation.prototype.exists");
    if (typeof relProto.scopeForCreate !== "function")
      missing.push("Relation.prototype.scopeForCreate");
    if (typeof baseTarget.findBy !== "function") missing.push("Base.findBy");
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
    prepend(baseTarget, {
      findBy(super_, ...args) {
        return CoreQueries.findBy.call(this, super_ as (...args: any[]) => unknown, args);
      },
    });
    prepend(eatProto, {
      serialize(super_, data) {
        return ExtendedEncryptableType.serialize((v: unknown) => super_.call(this, v), data);
      },
    });

    this._installed = true;
  }

  static get installed(): boolean {
    return this._installed;
  }
}

export class EncryptedQuery {
  /** @missingRailsCall empty? — PERMANENT */
  static processArguments(
    owner: any,
    args: unknown[],
    checkForAdditionalValues: boolean,
  ): unknown[] {
    const model = owner._model ?? owner;
    const encryptedAttrs = model.encryptedAttributes as Set<string> | undefined;
    if (!encryptedAttrs?.size) return args;

    if (!Array.isArray(args) || args.length === 0) return args;
    const options = args[0];
    if (typeof options !== "object" || options === null) return args;

    const result = { ...options } as Record<string, unknown>;
    let modified = false;

    for (const attrName of encryptedAttrs) {
      const fullType = model.typeForAttribute(attrName) as SerializableType | undefined;
      const type = encryptedTypeOf(fullType);
      if (!fullType || !type) continue;
      if (!type.deterministic) continue;
      if (!type.previousTypes.length) continue;
      const value = result[attrName];
      if (value === undefined) continue;
      result[attrName] = this.processEncryptedQueryArgument(value, checkForAdditionalValues, type);
      modified = true;
    }

    return modified ? [result, ...args.slice(1)] : args;
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

  /** @missingRailsCall any? — PERMANENT */
  static scopeForCreate(
    this: any,
    originalScopeForCreate: (...args: any[]) => unknown,
  ): Record<string, unknown> {
    const model = this.model ?? this;
    const encryptedAttrs = model.encryptedAttributes as Set<string> | undefined;
    if (!encryptedAttrs?.size) return originalScopeForCreate.call(this) as Record<string, unknown>;

    const scopeAttrs = originalScopeForCreate.call(this) as Record<string, unknown>;
    const wheres = this.whereValuesHash();
    for (const attrName of encryptedAttrs) {
      const type = encryptedTypeOf(model.typeForAttribute(attrName));
      if (!type?.deterministic) continue;
      const values = wheres[attrName];
      if (
        Array.isArray(values) &&
        values.length > 0 &&
        values.slice(1).every((v) => v instanceof AdditionalValue)
      ) {
        scopeAttrs[attrName] = values[0];
      }
    }
    return scopeAttrs;
  }
}

export class CoreQueries {
  static findBy(this: any, originalFindBy: (...args: any[]) => unknown, args: unknown[]): unknown {
    return originalFindBy.call(this, ...EncryptedQuery.processArguments(this, args, false));
  }
}

export class AdditionalValue {
  readonly value: unknown;
  readonly type: SerializableType;
  readonly [ADDITIONAL_VALUE_BRAND] = true;

  constructor(value: unknown, type: SerializableType) {
    this.type = type;
    this.value = this.process(value);
  }

  /** @internal */
  private process(value: unknown): unknown {
    return this.type.serialize(value);
  }

  get valueForDatabase(): unknown {
    return this.value;
  }

  toString(): string {
    return String(this.value);
  }

  /** @noRailsEquivalent PERMANENT */
  valueOf(): unknown {
    return this.value;
  }

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
