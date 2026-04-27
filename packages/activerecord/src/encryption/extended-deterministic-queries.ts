import { NotImplementedError } from "../errors.js";
import { prepend } from "@blazetrails/activesupport";
import { ADDITIONAL_VALUE_BRAND, EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { getAttributeType } from "./encryptable-record.js";

/**
 * Automatically expands encrypted arguments to support querying both
 * encrypted and unencrypted data during encryption migration periods.
 *
 * Mirrors: ActiveRecord::Encryption::ExtendedDeterministicQueries
 */
export class ExtendedDeterministicQueries {
  private static _installed = false;

  /**
   * Install the query-expansion patches. Rails does this via `prepend`:
   *
   *   ActiveRecord::Relation.prepend(RelationQueries)
   *   ActiveRecord::Base.include(CoreQueries)
   *   ActiveRecord::Encryption::EncryptedAttributeType.prepend(ExtendedEncryptableType)
   *
   * TS has no prepend, so we wrap prototype methods in place. Idempotent.
   * Call this once during app boot when
   * `Configurable.config.extendQueries` is true (Rails'
   * `config.active_record.encryption.extend_queries`).
   */
  static installSupport(targets: {
    Relation: { prototype: { where: Function; exists: Function; scopeForCreate: Function } };
    Base: { findBy: Function };
    EncryptedAttributeType: { prototype: { serialize: Function } };
  }): void {
    if (this._installed) return;

    // Pre-validate every target method across all three prepend() calls
    // so a missing method can't leave us with one class already patched
    // and another un-patched — a non-atomic state that a retry would
    // double-wrap. Rails' `prepend` at boot is effectively all-or-
    // nothing; this matches that intent.
    // `prepend()` needs an open object-with-Function-values shape, so
    // cast at the call site rather than widening the public signature.
    const relProto = targets.Relation.prototype as unknown as Record<string, Function>;
    const baseTarget = targets.Base as unknown as Record<string, Function>;
    const eatProto = targets.EncryptedAttributeType.prototype as unknown as Record<
      string,
      Function
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
        return RelationQueries.where(super_, this, args);
      },
      exists(super_, ...args) {
        return RelationQueries.isExists(super_, this, args);
      },
      scopeForCreate(super_) {
        return RelationQueries.scopeForCreate(super_, this);
      },
    });
    prepend(baseTarget, {
      findBy(super_, ...args) {
        return CoreQueries.findBy(super_, this, args);
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
    checkForAdditionalValues: boolean,
    type: EncryptedAttributeType,
  ): unknown {
    if (value === null) return value;

    // Rails' process_encrypted_query_argument short-circuits when the
    // caller is a Relation (`where`/`exists?`) and the value is already
    // an expanded array whose last element is an AdditionalValue — that
    // means a previous `where` on the same relation already ran
    // processArguments, and re-expanding would produce AV-of-AV. Only
    // checked for Relation paths (checkForAdditionalValues=true);
    // `findBy` via CoreQueries uses false and always expands because
    // its inputs come straight from the user.
    if (
      checkForAdditionalValues &&
      Array.isArray(value) &&
      value.length > 0 &&
      value[value.length - 1] instanceof AdditionalValue
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.flatMap((v) => {
        if (v === null) return [v];
        if (checkForAdditionalValues && v instanceof AdditionalValue) return [v];
        return this.allCiphertextsFor(v, type);
      });
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
    return originalWhere.call(relation, ...EncryptedQuery.processArguments(relation, args, true));
  }

  static isExists(originalExists: Function, relation: any, args: unknown[]): unknown {
    return originalExists.call(relation, ...EncryptedQuery.processArguments(relation, args, true));
  }

  static scopeForCreate(originalScopeForCreate: Function, relation: any): Record<string, unknown> {
    const model = relation.model ?? relation;
    const encryptedAttrs = model._encryptedAttributes as Set<string> | undefined;
    if (!encryptedAttrs?.size) return originalScopeForCreate.call(relation);

    const scopeAttrs = originalScopeForCreate.call(relation);
    const wheres = relation.whereValuesHash();
    for (const attrName of encryptedAttrs) {
      const type = getAttributeType(model, attrName);
      if (!(type instanceof EncryptedAttributeType) || !type.deterministic) continue;
      const values = wheres[attrName];
      if (Array.isArray(values) && values[0] instanceof AdditionalValue) {
        // Our expansion stores AdditionalValue(current) at index 0 (see
        // allCiphertextsFor). Keep the AV reference — when the new record
        // saves, EncryptedAttributeType.serialize (patched via
        // ExtendedEncryptableType) unwraps it to the ciphertext without
        // re-encrypting. Writing values[0].value directly would serialize
        // the ciphertext as plaintext, producing a double-encrypted blob.
        scopeAttrs[attrName] = values[0];
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
  // Brand flag so EncryptedAttributeType.cast can identify AV instances
  // without importing this module (which would be circular).
  readonly [ADDITIONAL_VALUE_BRAND] = true;

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

function process(value: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::AdditionalValue#process is not implemented",
  );
}

function additionalValuesFor(value: any, type: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::EncryptedQuery#additional_values_for is not implemented",
  );
}
