import { Scheme, type SchemeOptions } from "./scheme.js";
import { getEncryptionContext, withoutEncryption as _withoutEncryption } from "./context.js";
import { Configuration as ConfigurationError } from "./errors.js";
import { LengthValidator } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";
import { KeyGenerator } from "./key-generator.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

// Memoized SHA1 key provider: PBKDF2 is expensive (65536 iterations), so
// reuse the same provider as long as primaryKey and keyDerivationSalt haven't
// changed. Keyed on the tuple so config rotation invalidates the cache.
let _sha1ProviderCache:
  | {
      primaryKey: string | string[];
      keyDerivationSalt: string | undefined;
      provider: DerivedSecretKeyProvider;
    }
  | undefined;

function getSha1KeyProvider(
  primaryKey: string | string[],
  keyDerivationSalt: string | undefined,
): DerivedSecretKeyProvider {
  const cacheKey = JSON.stringify(primaryKey);
  if (
    _sha1ProviderCache &&
    JSON.stringify(_sha1ProviderCache.primaryKey) === cacheKey &&
    _sha1ProviderCache.keyDerivationSalt === keyDerivationSalt
  ) {
    return _sha1ProviderCache.provider;
  }
  const provider = new DerivedSecretKeyProvider(primaryKey, {
    keyGenerator: new KeyGenerator("SHA1"),
  });
  _sha1ProviderCache = { primaryKey, keyDerivationSalt, provider };
  return provider;
}

/**
 * Mirrors Rails' EncryptableRecord#global_previous_schemes_for.
 * Exported so encryption.ts (Base.encrypts path) can use the same logic.
 * Filters config.previousSchemes to those compatible with the given scheme
 * and merges each one so per-attribute settings (deterministic, downcase)
 * are preserved in the fallback scheme.
 *
 * @internal
 */
export function globalPreviousSchemesFor(scheme: Scheme): Scheme[] {
  const config = Configurable.config;
  const allSchemeOptions: SchemeOptions[] = [...config.previousSchemes];

  // Mirrors Rails' support_sha1_for_non_deterministic_encryption= setter:
  // builds the SHA1 DerivedSecretKeyProvider lazily here (not in Config) to
  // avoid a config → key-generator → configurable → config circular import.
  if (config.supportSha1ForNonDeterministicEncryption && config.primaryKey) {
    allSchemeOptions.push({
      keyProvider: getSha1KeyProvider(config.primaryKey, config.keyDerivationSalt),
    });
  }

  return allSchemeOptions
    .map((opts) => new Scheme(opts))
    .filter((prev) => scheme.isCompatibleWith(prev))
    .map((prev) => scheme.merge(prev));
}

/**
 * Mirrors Rails' EncryptableRecord#scheme_for.
 * Builds the scheme with global previous schemes prepended to any
 * per-attribute previousSchemes declared in options.
 *
 * @internal
 */
function schemeFor(options: SchemeOptions): Scheme {
  const { previousSchemes: localPrevious = [], ...rest } = options;
  const base = new Scheme(rest);
  const globalPrevious = globalPreviousSchemesFor(base);
  const allPrevious = [...globalPrevious, ...localPrevious];
  return allPrevious.length > 0 ? new Scheme({ ...rest, previousSchemes: allPrevious }) : base;
}

const ORIGINAL_ATTRIBUTE_PREFIX = "original_";

/**
 * Provides the `encrypts` declaration for model classes, enabling
 * transparent attribute encryption/decryption. This is wired into
 * Base.encrypts() via the encryption.ts module.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord
 *
 * Usage:
 *   EncryptableRecord.encrypts(User, "email", { deterministic: true })
 */
export class EncryptableRecord {
  /**
   * Declare that attributes should be encrypted. Registers an
   * EncryptedAttributeType for each named attribute directly into
   * _attributeDefinitions and notifies Configurable listeners.
   */
  static encrypts(modelClass: any, ...namesAndOptions: unknown[]): void {
    let options: SchemeOptions = {};
    const names: string[] = [];

    for (const arg of namesAndOptions) {
      if (typeof arg === "string") {
        names.push(arg);
      } else if (typeof arg === "object" && arg !== null) {
        options = arg as SchemeOptions;
      }
    }

    const scheme = schemeFor(options);

    if (!modelClass._encryptedAttributes) {
      modelClass._encryptedAttributes = new Set<string>();
    }

    for (const name of names) {
      modelClass._encryptedAttributes.add(name);

      // Get existing cast type from attribute definitions if available.
      // If already encrypted, unwrap to avoid double-encryption.
      const existingDef = modelClass._attributeDefinitions?.get?.(name);
      let castType = existingDef?.type;
      if (castType instanceof EncryptedAttributeType) {
        castType = castType.castType;
      }

      const encryptedType = new EncryptedAttributeType({
        scheme,
        castType,
      });

      // Register directly into _attributeDefinitions (not via attribute()
      // which expects a string type name)
      if (modelClass._attributeDefinitions?.set) {
        modelClass._attributeDefinitions.set(name, {
          name,
          type: encryptedType,
          defaultValue: existingDef?.defaultValue ?? null,
          // When there's no pre-existing def, this encryption placeholder is
          // waiting for schema reflection to supply the real cast type.
          // Mark it schema-sourced so loadSchemaFromAdapter can wrap the
          // adapter-resolved type (applyPendingEncryptions re-runs after).
          userProvided: existingDef?.userProvided ?? false,
          source: existingDef?.source ?? "schema",
          ...((existingDef as any)?.limit != null ? { limit: (existingDef as any).limit } : {}),
        });
      }

      if (Configurable.config.validateColumnSize) {
        EncryptableRecord.validateColumnSize(modelClass, name);
      }

      Configurable.encryptedAttributeWasDeclared(modelClass, name);
    }
  }

  /** @internal */
  static validateColumnSize(modelClass: any, attribute: string): void {
    if (typeof modelClass.validatesLengthOf !== "function") return;
    const limit = (modelClass._attributeDefinitions?.get(attribute) as any)?.limit;
    if (limit == null) return;
    // Guard against double registration (called at encrypts() time and again
    // after schema reflection). Check whether a LengthValidator with this
    // exact maximum already exists for the attribute.
    const existing: unknown[] = modelClass._validators?.get(attribute) ?? [];
    const alreadyRegistered = existing.some(
      (v: unknown) => v instanceof LengthValidator && (v as any).options?.maximum === limit,
    );
    if (!alreadyRegistered) {
      modelClass.validatesLengthOf(attribute, { maximum: limit });
    }
  }

  /** @internal */
  static hasEncryptedAttributes(modelClass: any): boolean {
    return (modelClass._encryptedAttributes?.size ?? 0) > 0;
  }

  static encryptedAttributes(modelClass: any): Set<string> {
    return modelClass._encryptedAttributes ?? new Set();
  }

  static sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined {
    return attributeName.startsWith(ORIGINAL_ATTRIBUTE_PREFIX)
      ? attributeName.slice(ORIGINAL_ATTRIBUTE_PREFIX.length)
      : undefined;
  }

  static deterministicEncryptedAttributes(modelClass: any): Set<string> {
    const result = new Set<string>();
    for (const name of this.encryptedAttributes(modelClass)) {
      const type = getAttributeType(modelClass, name);
      if (type instanceof EncryptedAttributeType && type.deterministic) {
        result.add(name);
      }
    }
    return result;
  }

  /** @internal */
  static encryptAttribute(modelClass: any, name: string, options: SchemeOptions = {}): void {
    this.encrypts(modelClass, name, options);
  }

  /** @internal */
  static preserveOriginalEncrypted(modelClass: any, name: string): void {
    const originalName = `original_${name}`;
    this.encrypts(modelClass, originalName);
    this.overrideAccessorsToPreserveOriginal(modelClass, name, originalName);
  }

  /** @internal */
  static overrideAccessorsToPreserveOriginal(
    modelClass: any,
    name: string,
    originalName: string,
  ): void {
    // In TS we can't dynamically override accessors the way Ruby can,
    // but we record the mapping for consumers that need it.
  }

  /** @internal */
  static loadSchemaBang(modelClass: any): void {
    if (Configurable.config.validateColumnSize) {
      this.addLengthValidationForEncryptedColumns(modelClass);
    }
  }

  /** @internal */
  static addLengthValidationForEncryptedColumns(modelClass: any): void {
    const attrs: Set<string> = modelClass._encryptedAttributes ?? new Set();
    for (const name of attrs) {
      this.validateColumnSize(modelClass, name);
    }
  }

  /** @internal */
  static isEncryptedAttribute(record: any, attributeName: string): boolean {
    const klass = record.constructor as any;
    if (!klass._encryptedAttributes?.has(attributeName)) return false;
    const type = getAttributeType(klass, attributeName);
    if (!(type instanceof EncryptedAttributeType)) return false;
    const raw = record.readAttributeBeforeTypeCast?.(attributeName);
    return type.isEncrypted(raw);
  }

  /** @internal */
  static ciphertextFor(record: any, attributeName: string): unknown {
    if (this.isEncryptedAttribute(record, attributeName)) {
      return record.readAttributeBeforeTypeCast?.(attributeName);
    }
    return record.readAttribute?.(attributeName);
  }

  /** @internal */
  static async encrypt(record: any): Promise<void> {
    if (this.hasEncryptedAttributes(record.constructor)) {
      await this.encryptAttributes(record);
    }
  }

  /** @internal */
  static async decrypt(record: any): Promise<void> {
    if (this.hasEncryptedAttributes(record.constructor)) {
      await this.decryptAttributes(record);
    }
  }

  /** @internal */
  static _createRecord(record: any, attributeNames?: string[]): unknown {
    // Ensure encrypted attributes are always included in persisted column list.
    const names = attributeNames ?? record.attributeNames ?? [];
    const encryptedAttrs: Set<string> = record.constructor._encryptedAttributes ?? new Set();
    const all = [...new Set([...names, ...encryptedAttrs])];
    return record._createRecord?.(all);
  }

  /** @internal */
  static async encryptAttributes(record: any): Promise<void> {
    this.validateEncryptionAllowed(record);
    const assignments = this.buildEncryptAttributeAssignments(record);
    await record.updateColumns?.(assignments);
  }

  /** @internal */
  static async decryptAttributes(record: any): Promise<void> {
    this.validateEncryptionAllowed(record);
    const assignments = this.buildDecryptAttributeAssignments(record);
    await _withoutEncryption(() => record.updateColumns?.(assignments));
  }

  /** @internal */
  static validateEncryptionAllowed(_record: any): void {
    const ctx = getEncryptionContext();
    if (ctx.frozenEncryption) {
      throw new ConfigurationError("can't be modified because it is encrypted");
    }
  }

  /** @internal */
  static buildEncryptAttributeAssignments(record: any): Record<string, unknown> {
    const klass = record.constructor as any;
    const result: Record<string, unknown> = {};
    for (const name of klass._encryptedAttributes ?? new Set<string>()) {
      result[name] = record[name];
    }
    return result;
  }

  /** @internal */
  static buildDecryptAttributeAssignments(record: any): Record<string, unknown> {
    const klass = record.constructor as any;
    const result: Record<string, unknown> = {};
    for (const name of klass._encryptedAttributes ?? new Set<string>()) {
      const type = getAttributeType(klass, name);
      const raw = record.readAttributeBeforeTypeCast?.(name);
      result[name] = type instanceof EncryptedAttributeType ? type.deserialize(raw) : raw;
    }
    return result;
  }

  /** @internal */
  static cantModifyEncryptedAttributesWhenFrozen(record: any): void {
    const klass = record.constructor as any;
    for (const attr of klass._encryptedAttributes ?? new Set<string>()) {
      if (Object.prototype.hasOwnProperty.call(record.changedAttributes?.() ?? {}, attr)) {
        record.errors?.add?.(attr, "can't be modified because it is encrypted");
      }
    }
  }
}

/**
 * Get the attribute type from a model class's _attributeDefinitions.
 */
export function getAttributeType(klass: any, name: string): unknown {
  const def = klass._attributeDefinitions?.get?.(name);
  return def?.type;
}
