import { NotImplementedError } from "../errors.js";
import { Scheme, type SchemeOptions } from "./scheme.js";
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
}

/**
 * Get the attribute type from a model class's _attributeDefinitions.
 */
export function getAttributeType(klass: any, name: string): unknown {
  const def = klass._attributeDefinitions?.get?.(name);
  return def?.type;
}

/** @internal */
function encryptAttribute(
  name: any,
  keyProvider?: any,
  key?: any,
  deterministic?: any,
  supportUnencryptedData?: any,
  downcase?: any,
  ignoreCase?: any,
  previous?: any,
  compress?: any,
  compressor?: any,
  contextProperties?: any,
): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#encrypt_attribute is not implemented",
  );
}

/** @internal */
function preserveOriginalEncrypted(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#preserve_original_encrypted is not implemented",
  );
}

/** @internal */
function overrideAccessorsToPreserveOriginal(name: any, originalAttributeName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#override_accessors_to_preserve_original is not implemented",
  );
}

/** @internal */
function loadSchemaBang(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#load_schema! is not implemented",
  );
}

/** @internal */
function addLengthValidationForEncryptedColumns(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#add_length_validation_for_encrypted_columns is not implemented",
  );
}

/** @internal */
function validateColumnSize(attributeName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#validate_column_size is not implemented",
  );
}

/** @internal */
function isEncryptedAttribute(attributeName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#encrypted_attribute? is not implemented",
  );
}

/** @internal */
function ciphertextFor(attributeName: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#ciphertext_for is not implemented",
  );
}

/** @internal */
function encrypt(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#encrypt is not implemented",
  );
}

/** @internal */
function decrypt(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#decrypt is not implemented",
  );
}

/** @internal */
function _createRecord(attributeNames?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#_create_record is not implemented",
  );
}

/** @internal */
function encryptAttributes(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#encrypt_attributes is not implemented",
  );
}

/** @internal */
function decryptAttributes(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#decrypt_attributes is not implemented",
  );
}

/** @internal */
function validateEncryptionAllowed(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#validate_encryption_allowed is not implemented",
  );
}

/** @internal */
function hasEncryptedAttributes(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#has_encrypted_attributes? is not implemented",
  );
}

/** @internal */
function buildEncryptAttributeAssignments(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#build_encrypt_attribute_assignments is not implemented",
  );
}

/** @internal */
function buildDecryptAttributeAssignments(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#build_decrypt_attribute_assignments is not implemented",
  );
}

/** @internal */
function cantModifyEncryptedAttributesWhenFrozen(): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::EncryptableRecord#cant_modify_encrypted_attributes_when_frozen is not implemented",
  );
}
