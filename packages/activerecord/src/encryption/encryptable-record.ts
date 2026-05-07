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
// changed. Cleared by the onConfigure hook below so config rotation invalidates it.
let _sha1ProviderCache:
  | {
      primaryKey: string | string[];
      keyDerivationSalt: string | undefined;
      provider: DerivedSecretKeyProvider;
    }
  | undefined;

// Clear the SHA1 provider cache whenever configure() is called so the new
// primary key / key derivation salt is picked up on the next encrypt call.
Configurable.onConfigure(() => {
  _sha1ProviderCache = undefined;
});

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
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    // Mirrors Rails encryptable_record.rb:101–103: raise at declaration time
    // when the original_<name> column is absent and supportUnencryptedData is
    // false (which means there's no fallback for reading un-preserved rows).
    if (!Configurable.config.supportUnencryptedData) {
      const colNames: string[] = modelClass.columnNames?.() ?? [];
      if (!colNames.includes(originalName)) {
        throw new ConfigurationError(
          `To use :ignore_case for '${name}' you must create an additional column named '${originalName}'`,
        );
      }
    }
    this.encrypts(modelClass, originalName);
    this.overrideAccessorsToPreserveOriginal(modelClass, name, originalName);
  }

  /** @internal */
  static overrideAccessorsToPreserveOriginal(
    modelClass: any,
    name: string,
    originalName: string,
  ): void {
    // Before each save, sync the in-memory value of `name` into `originalName`
    // when `name` has been written. For new records always sync (changedAttributes
    // is empty before the first save snapshot). Mirrors Rails'
    // `name= { self.original_name = value; super(value) }`.
    if (typeof modelClass.beforeSave === "function") {
      modelClass.beforeSave((record: any) => {
        const isNew =
          typeof record.isNewRecord === "function" ? record.isNewRecord() : !record.isPersisted?.();
        const changed: string[] = Array.isArray(record.changedAttributes)
          ? record.changedAttributes
          : [];
        if (!isNew && !changed.includes(name)) return;
        record.writeAttribute(originalName, record.readAttribute(name));
      });
    }
    // Override prototype accessor. Getter returns originalName when present
    // (case-preserving read), falling back to name for legacy rows. Setter
    // writes both so in-memory reads see the new value before save.
    Object.defineProperty(modelClass.prototype, name, {
      configurable: true,
      get(this: any) {
        const originalValue = this.readAttribute(originalName);
        if (originalValue != null) return originalValue;
        return this.readAttribute(name);
      },
      set(this: any, value: unknown) {
        this.writeAttribute(name, value);
        this.writeAttribute(originalName, value);
      },
    });
  }

  /** @internal */
  static loadSchemaBang(modelClass: any): void {
    if (Configurable.config.validateColumnSize) {
      this.addLengthValidationForEncryptedColumns(modelClass);
    }
  }

  /** @internal */
  static addLengthValidationForEncryptedColumns(modelClass: any): void {
    const attrs: Set<string> = modelClass._encryptedAttributes ?? new Set<string>();
    for (const name of attrs) {
      this.validateColumnSize(modelClass, name);
    }
  }

  /**
   * Instance-level encrypted-attribute check: resolves aliases and verifies
   * the stored value is actually encrypted (calls `type.isEncrypted`).
   * Distinct from `encryption.ts#isEncryptedAttribute(klass, attr)` which is
   * a class-level check (is the attribute declared encrypted on this class?).
   * @internal
   */
  static isEncryptedAttribute(record: any, attributeName: string): boolean {
    const klass = record.constructor as any;
    // Resolve attribute aliases before checking encrypted set.
    const resolvedName = klass._attributeAliases?.[attributeName] ?? attributeName;
    if (!klass._encryptedAttributes?.has(resolvedName)) return false;
    const type = getAttributeType(klass, resolvedName);
    if (!(type instanceof EncryptedAttributeType)) return false;
    const raw = record.readAttributeBeforeTypeCast?.(resolvedName);
    return type.isEncrypted(raw);
  }

  /** @internal */
  static ciphertextFor(record: any, attributeName: string): unknown {
    const klass = record.constructor as any;
    const resolvedName = klass._attributeAliases?.[attributeName] ?? attributeName;
    if (this.isEncryptedAttribute(record, attributeName)) {
      return record.readAttributeBeforeTypeCast?.(resolvedName);
    }
    // Unencrypted — return the DB-serialized value (mirrors read_attribute_for_database).
    return record._attributes?.valuesForDatabase?.()?.[resolvedName];
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
    // Mirrors Rails: force encrypted attrs into the INSERT column list so a
    // column with an encrypted default is always written on first save.
    const names = attributeNames ?? record.attributeNames ?? [];
    const encryptedAttrs: Set<string> =
      record.constructor._encryptedAttributes ?? new Set<string>();
    const merged = [...new Set<string>([...names, ...encryptedAttrs])];
    return record._createRecord?.(merged);
  }

  /** @internal */
  static async encryptAttributes(record: any): Promise<void> {
    this.validateEncryptionAllowed(record);
    const klass = record.constructor as any;
    // Rails: update_columns build_encrypt_attribute_assignments.
    // buildEncryptAttributeAssignments returns plaintext values (Rails parity).
    // updateColumns uses cast() not serialize(), so pre-serialize here so the
    // DB write stores ciphertext. Mirrors encryption.ts#encryptRecord.
    const plaintextValues = this.buildEncryptAttributeAssignments(record);
    const assignments: Record<string, unknown> = {};
    for (const [name, plaintext] of Object.entries(plaintextValues)) {
      const type = getAttributeType(klass, name);
      assignments[name] =
        type instanceof EncryptedAttributeType ? type.serialize(plaintext) : plaintext;
    }

    await record.updateColumns(assignments);

    // Restore plaintext as the in-memory cast value — updateColumns set the
    // ciphertext as the live value via cast(), but callers expect to read plaintext.
    for (const [name, plaintext] of Object.entries(plaintextValues)) {
      record._attributes.writeCastValue(name, plaintext);
    }
    record.changesApplied();
  }

  /** @internal */
  static async decryptAttributes(record: any): Promise<void> {
    this.validateEncryptionAllowed(record);
    const assignments = this.buildDecryptAttributeAssignments(record);
    await _withoutEncryption(() => record.updateColumns(assignments));
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
      result[name] = record.readAttribute?.(name) ?? record[name];
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
      // Only decrypt if actually encrypted — mirrors Rails' type.deserialize
      // which returns the raw value when support_unencrypted_data is true.
      if (type instanceof EncryptedAttributeType && type.isEncrypted(raw)) {
        result[name] = type.deserialize(raw);
      } else {
        // Plaintext — return the cast value so typed columns (date, JSON, etc.)
        // keep their in-memory representation rather than the raw DB string.
        result[name] = record.readAttribute?.(name) ?? raw;
      }
    }
    return result;
  }

  /** @internal */
  static cantModifyEncryptedAttributesWhenFrozen(record: any): void {
    const klass = record.constructor as any;
    const encryptedAttrs: Set<string> = klass._encryptedAttributes ?? new Set();
    // changedAttributes is a string[] in this codebase (from DirtyTracker).
    // Iterate changed once and check Set membership — O(n+m) vs O(n×m).
    const changed: string[] = Array.isArray(record.changedAttributes)
      ? record.changedAttributes
      : [];
    for (const attr of changed) {
      if (encryptedAttrs.has(attr)) {
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
