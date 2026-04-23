import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { getAttributeType } from "./encryptable-record.js";

/**
 * Automatically expands encrypted arguments to support querying both
 * encrypted and unencrypted data during encryption migration periods.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries
 */
export class ExtendedDeterministicQueries {
  private static _installed = false;

  static installSupport(): void {
    this._installed = true;
  }

  static get installed(): boolean {
    return this._installed;
  }
}

/**
 * Processes query arguments, expanding deterministic encrypted values
 * to include ciphertexts from previous encryption schemes.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries::EncryptedQuery
 */
export class EncryptedQuery {
  static processArguments(
    owner: any,
    args: unknown[],
    checkForAdditionalValues: boolean,
  ): unknown[] {
    const model = owner._modelClass ?? owner;
    const encryptedAttrs = model._encryptedAttributes as Set<string> | undefined;
    if (!encryptedAttrs?.size) return args;

    if (!Array.isArray(args) || args.length === 0) return args;
    const options = args[0];
    if (typeof options !== "object" || options === null) return args;

    const result = { ...options } as Record<string, unknown>;
    let modified = false;

    for (const attrName of encryptedAttrs) {
      const type = getAttributeType(model, attrName);
      if (!(type instanceof EncryptedAttributeType)) continue;
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
    _checkForAdditionalValues: boolean,
    type: EncryptedAttributeType,
  ): unknown {
    if (value === null) return value;
    if (Array.isArray(value)) {
      return value.flatMap((v) => (v === null ? [v] : this.allCiphertextsFor(v, type)));
    }
    return this.allCiphertextsFor(value, type);
  }

  private static allCiphertextsFor(
    plaintext: unknown,
    type: EncryptedAttributeType,
  ): Array<AdditionalValue | unknown> {
    // Unlike Rails (which keeps plaintext at index 0 and relies on the
    // PredicateBuilder type-casting scalars to encrypt them), our
    // PredicateBuilder only type-casts objects via `build`/`QueryAttribute`.
    // Plain scalars in an IN array bypass `EncryptedAttributeType.serialize`
    // and land in the SQL unencrypted. Wrapping encrypted candidates in
    // AdditionalValue ensures those elements go through `predicateBuilder.build`
    // → `ExtendedEncryptableType.serialize` → pre-computed ciphertext, while
    // still preserving the raw plaintext when unencrypted data remains queryable
    // during migration (support_unencrypted_data).
    const results: Array<AdditionalValue | unknown> = [new AdditionalValue(plaintext, type)];
    for (const prev of type.previousTypes) {
      results.push(new AdditionalValue(plaintext, prev));
    }
    if (type.supportUnencryptedData) {
      results.push(plaintext);
    }
    return results;
  }
}

/**
 * Mixin that patches Relation#where, #exists?, and #scope_for_create to
 * expand encrypted query arguments via EncryptedQuery.processArguments.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries::RelationQueries
 */
export class RelationQueries {
  static where(originalWhere: Function, relation: any, args: unknown[]): unknown {
    const processed = EncryptedQuery.processArguments(relation, args, true);
    const result = originalWhere.call(relation, ...processed) as any;
    // Store the expanded conditions on the returned relation so scopeForCreate
    // can access the AdditionalValue arrays directly, bypassing WhereClause.toH()
    // which cannot extract OR chains produced by ArrayHandler for object values.
    if (processed !== args && processed.length > 0 && typeof processed[0] === "object") {
      result._encryptionExpansion = {
        ...(relation._encryptionExpansion ?? {}),
        ...(processed[0] as Record<string, unknown>),
      };
    }
    return result;
  }

  static isExists(originalExists: Function, relation: any, args: unknown[]): unknown {
    return originalExists.call(relation, ...EncryptedQuery.processArguments(relation, args, true));
  }

  static scopeForCreate(
    originalScopeForCreate: () => Record<string, unknown>,
    relation: any,
  ): Record<string, unknown> {
    const model = relation._modelClass ?? relation;
    const encryptedAttrs = model._encryptedAttributes as Set<string> | undefined;
    if (!encryptedAttrs?.size) return originalScopeForCreate.call(relation);

    const scopeAttrs = originalScopeForCreate.call(relation);
    const wheres: Record<string, unknown> = relation._encryptionExpansion ?? {};
    for (const attrName of encryptedAttrs) {
      const type = getAttributeType(model, attrName);
      if (!(type instanceof EncryptedAttributeType) || !type.deterministic) continue;
      const values = wheres[attrName];
      if (Array.isArray(values) && values[0] instanceof AdditionalValue) {
        // values[0] is AdditionalValue for the current scheme — unwrap to ciphertext
        // so the created record stores the correct encrypted value directly.
        scopeAttrs[attrName] = (values[0] as AdditionalValue).value;
      }
    }
    return scopeAttrs;
  }
}

/**
 * Mixin that patches Base.findBy to expand encrypted query arguments.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries::CoreQueries
 */
export class CoreQueries {
  static findBy(originalFindBy: Function, klass: any, args: unknown[]): unknown {
    return originalFindBy.call(klass, ...EncryptedQuery.processArguments(klass, args, false));
  }
}

/**
 * Wraps a value encrypted with a previous scheme. Used as a marker
 * during query expansion to track which values are already encrypted.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries::AdditionalValue
 */
export class AdditionalValue {
  readonly value: unknown;
  readonly type: EncryptedAttributeType;

  constructor(value: unknown, type: EncryptedAttributeType) {
    this.type = type;
    this.value = type.serialize(value);
  }

  toString(): string {
    return String(this.value);
  }

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

/**
 * Patches EncryptedAttributeType#serialize to pass through
 * AdditionalValue instances without re-encrypting.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries::ExtendedEncryptableType
 */
export class ExtendedEncryptableType {
  static serialize(originalSerialize: (data: unknown) => unknown, data: unknown): unknown {
    if (data instanceof AdditionalValue) {
      return data.value;
    }
    return originalSerialize(data);
  }
}
