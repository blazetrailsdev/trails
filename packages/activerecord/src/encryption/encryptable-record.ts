import { Scheme, type SchemeOptions } from "./scheme.js";
import {
  getEncryptionContext,
  withoutEncryption as _withoutEncryption,
  setEncryptingOnlyEncryptorFactory,
} from "./context.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";
import { Configuration as ConfigurationError } from "./errors.js";
import { LengthValidator, type Type } from "@blazetrails/activemodel";
import { EncryptedAttributeType, setGlobalPreviousSchemesFn } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";
import { KeyGenerator } from "./key-generator.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { encryptionHooks } from "../encryption-hooks.js";

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
 * Builds the scheme with only locally-declared previousSchemes; global previous
 * schemes are resolved lazily in EncryptedAttributeType at serialize/deserialize
 * time so that configure() calls after encrypts() are picked up automatically.
 *
 * @internal
 */
function schemeFor(options: SchemeOptions): Scheme {
  const { previousSchemes: localPrevious = [], ...rest } = options;
  return localPrevious.length > 0
    ? new Scheme({ ...rest, previousSchemes: localPrevious })
    : new Scheme(rest);
}

// Register the global-previous-schemes provider into EncryptedAttributeType.
// Called at module load time — always runs before any EncryptedAttributeType
// accesses previousTypes because this module is loaded via encryption.ts first.
setGlobalPreviousSchemesFn(globalPreviousSchemesFor);

// Register the EncryptingOnlyEncryptor factory so protectingEncryptedData can
// construct it without an eval-time import cycle. This module is loaded via
// encryption.ts before any protectingEncryptedData call, and after Configurable
// is fully defined (so the Encryptor import chain resolves cleanly).
setEncryptingOnlyEncryptorFactory(() => new EncryptingOnlyEncryptor());

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

    // `encryptAttribute` own-property-guards `_encryptedAttributes` itself.
    for (const name of names) {
      this.encryptAttribute(modelClass, name, options);
    }
  }

  /** @internal */
  static validateColumnSize(modelClass: any, attribute: string): void {
    if (typeof modelClass.validatesLengthOf !== "function") return;
    const limit = modelClass._attributeDefinitions?.get(attribute)?.limit;
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

  /**
   * The single declaration path for encrypted attributes — both `Base.encrypts`
   * (via encryption.ts#encrypts) and direct callers route through here, mirroring
   * Rails' single `encrypt_attribute`.
   *
   * `prebuiltScheme` lets `Base.encrypts` supply a scheme built by
   * encryption.ts#buildScheme (which adapts the legacy `{ encrypt, decrypt }`
   * shim and supplies a defaultEncryptor fallback); direct callers omit it and
   * get a per-attribute scheme from `schemeFor`.
   *
   * @internal
   */
  static encryptAttribute(
    modelClass: any,
    name: string,
    options: SchemeOptions = {},
    prebuiltScheme?: Scheme,
  ): void {
    // Own-property guard mirrors Rails' `class_attribute` semantics — a subclass
    // encrypting a new attribute must not mutate the parent's (or a sibling's) Set.
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_encryptedAttributes")) {
      modelClass._encryptedAttributes = new Set<string>(modelClass._encryptedAttributes ?? []);
    }
    modelClass._encryptedAttributes.add(name);

    // Build the per-attribute scheme (mirrors Rails scheme_for) unless the caller
    // supplied one. Each attribute gets its own scheme so per-attribute options
    // (deterministic, downcase, previousSchemes) don't leak across declarations.
    const scheme = prebuiltScheme ?? schemeFor(options);

    if (typeof modelClass.decorateAttributes === "function") {
      // Durable path (real model classes): buffer the pending encryption in the
      // class's own `_pendingEncryptions` and apply it now — and again on every
      // `_defaultAttributes` rebuild / schema load. This gives the scheme path
      // its own replay buffer (the RFC 0047 follow-up registerEncryptedType's
      // doc references), so the encrypted type survives replay even though
      // `Base.encrypts` declares at static-init before the schema is loaded.
      this.registerPendingEncryption(modelClass, name, scheme);
      encryptionHooks.applyPendingEncryptions(modelClass);
    } else {
      // Immediate path (plain-object callers without decoration machinery, e.g.
      // direct `EncryptableRecord.encrypts` tests): register the encrypted type
      // synchronously so it's readable right after the call.
      this.registerEncryptedType(modelClass, name, scheme);
    }

    if (Configurable.config.validateColumnSize) {
      EncryptableRecord.validateColumnSize(modelClass, name);
    }

    // Mirrors Rails encryptable_record.rb:94 —
    // `preserve_original_encrypted(name) if ignore_case`. Wires the
    // case-preserving `original_<name>` column when the attribute is declared
    // with ignoreCase, so reads return the true-cased value.
    if (options.ignoreCase) {
      this.preserveOriginalEncrypted(modelClass, name);
    }

    Configurable.encryptedAttributeWasDeclared(modelClass, name);
  }

  /**
   * Record a pending encryption so `applyPendingEncryptions` (encryption.ts)
   * decorates the attribute now and re-decorates on every `_defaultAttributes`
   * rebuild. Own-property guarded like the encrypted-attribute Set.
   * @internal
   */
  static registerPendingEncryption(modelClass: any, name: string, scheme: Scheme): void {
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_pendingEncryptions")) {
      modelClass._pendingEncryptions = [...(modelClass._pendingEncryptions ?? [])];
    }
    modelClass._pendingEncryptions.push({ name, scheme });
  }

  /**
   * The single EncryptedAttributeType-wrapping primitive shared by both
   * declaration paths, so `Base.encrypts` (via `applyPendingEncryptions`) and
   * the scheme-based `encryptAttribute` register the wrapped type through one
   * implementation:
   *
   * - Models exposing `decorateAttributes` (real Base subclasses driven by the
   *   `Base.encrypts` → `applyPendingEncryptions` path) get a replay-safe
   *   PendingDecorator so `_defaultAttributes` re-wraps after schema reflection.
   *   Skips when the def isn't present yet — the persistent `_pendingEncryptions`
   *   buffer re-invokes this once the column is reflected — or already encrypted.
   * - Plain models (the scheme-based / mock-model test path) set
   *   `_attributeDefinitions` directly, seeding a schema-sourced placeholder
   *   when no def exists yet so `loadSchemaFromAdapter` can supply the real
   *   cast type on the next pass.
   *
   * The `decorateAttributes` branch skips when the def is absent and does NOT
   * buffer here — it relies on a persistent `_pendingEncryptions` buffer being
   * re-applied once the column is reflected. `encryptAttribute` now maintains
   * that buffer itself (via `registerPendingEncryption` before it calls
   * `applyPendingEncryptions`), so the scheme path is replay-safe on its own —
   * completing the RFC 0047 follow-up
   * `encrypt-route-primary-attribute-through-encrypt-attribute`. This method is
   * therefore only invoked from `applyPendingEncryptions` (durable path) or
   * directly by `encryptAttribute` for plain mock models (immediate path).
   * @internal
   */
  static registerEncryptedType(modelClass: any, name: string, scheme: Scheme): void {
    if (typeof modelClass.decorateAttributes === "function") {
      const def = modelClass._attributeDefinitions?.get?.(name);
      if (!def) return;
      if (def.type instanceof EncryptedAttributeType) return;
      // The decorator returns null when the type is already encrypted — the
      // PendingDecorator replays on every _defaultAttributes rebuild, so it
      // must be idempotent to avoid double-wrapping.
      modelClass.decorateAttributes([name], (_attrName: string, castType: Type) =>
        castType instanceof EncryptedAttributeType
          ? (null as unknown as Type)
          : new EncryptedAttributeType({ scheme, castType }),
      );
      return;
    }

    // Get existing cast type from attribute definitions if available.
    // If already encrypted, unwrap to avoid double-encryption.
    const existingDef = modelClass._attributeDefinitions?.get?.(name);
    let castType = existingDef?.type;
    if (castType instanceof EncryptedAttributeType) {
      castType = castType.castType;
    }

    const encryptedType = new EncryptedAttributeType({ scheme, castType });

    // Register directly into _attributeDefinitions (not via attribute()
    // which expects a string type name).
    if (modelClass._attributeDefinitions?.set) {
      modelClass._attributeDefinitions.set(name, {
        name,
        type: encryptedType,
        defaultValue: existingDef?.defaultValue ?? null,
        userProvided: existingDef?.userProvided ?? false,
        source: existingDef?.source ?? "schema",
        ...(existingDef?.limit != null ? { limit: existingDef.limit } : {}),
      });
    }
  }

  /**
   * Mirrors Rails' EncryptableRecord::ClassMethods#preserve_original_encrypted.
   * Declares the case-preserving `original_<name>` encrypted column and
   * overrides the accessors so reads return the original-cased value.
   * @internal
   */
  static preserveOriginalEncrypted(modelClass: any, name: string): void {
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    // Enforce the missing-column requirement against the columns known now.
    // `columnNames()` forces a schema load when an adapter is connected, so the
    // check fires for real models; at Base.encrypts static-init with no adapter
    // it returns [] and requireOriginalColumnPresent defers (see its doc).
    this.requireOriginalColumnPresent(modelClass, name, modelClass.columnNames?.() ?? []);

    // Declare original_<name> with a default scheme, mirroring Rails' bare
    // `encrypts original_attribute_name` (encryptable_record.rb:105 — no kwargs).
    // Build it through the shared buildScheme so the legacy encryptor shim +
    // defaultEncryptor fallback apply exactly as they do for the primary
    // attribute (a bare schemeFor({}) would raise "No encryption key provided"
    // when no keys are configured). Falls back to schemeFor when the encryption
    // namespace isn't loaded (pure-direct unit tests, which never serialize).
    // encryptAttribute's durable branch buffers this in _pendingEncryptions so
    // the original column rides the same replay-safe machinery as its source.
    const originalScheme = encryptionHooks.buildScheme?.({}) as Scheme | undefined;
    this.encryptAttribute(modelClass, originalName, {}, originalScheme);
    this.overrideAccessorsToPreserveOriginal(modelClass, name, originalName);
  }

  /**
   * Raise when a preserved (`ignore_case`) attribute's `original_<name>` column
   * is absent and `supportUnencryptedData` is false — mirrors Rails
   * encryptable_record.rb:101–103. Checked at declaration time against the
   * columns known then. Rails' `column_names` forces a schema load so the set is
   * always complete; ours can be empty at Base.encrypts static-init (the adapter
   * isn't connected yet), so an empty list means "unknown" and we defer rather
   * than raise a false positive — the same fail-open-when-unknown behavior the
   * scheme-based path shipped with.
   * @internal
   */
  static requireOriginalColumnPresent(modelClass: any, name: string, colNames: string[]): void {
    if (Configurable.config.supportUnencryptedData) return;
    const originalName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
    // Empty list ⇒ schema not loaded yet: defer rather than raise a false positive.
    if (colNames.length === 0 || colNames.includes(originalName)) return;
    throw new ConfigurationError(
      `To use :ignore_case for '${name}' you must create an additional column named '${originalName}'`,
    );
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
    const klass = record.constructor;
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
    const klass = record.constructor;
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
    const names =
      attributeNames ??
      (typeof record.attributeNames === "function" ? record.attributeNames() : []);
    const encryptedAttrs: Set<string> =
      record.constructor._encryptedAttributes ?? new Set<string>();
    const merged = [...new Set<string>([...names, ...encryptedAttrs])];
    return record._createRecord?.(merged);
  }

  /** @internal */
  static async encryptAttributes(record: any): Promise<void> {
    this.validateEncryptionAllowed(record);
    // Mirrors Rails encrypt_attributes (encryptable_record.rb:187-191):
    //   update_columns build_encrypt_attribute_assignments
    // buildEncryptAttributeAssignments returns plaintext values; updateColumns
    // writes them as the in-memory cast value and serializes each (via
    // SerializeCastValue.serialize) to ciphertext for the DB write.
    await record.updateColumns(this.buildEncryptAttributeAssignments(record));
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
    const klass = record.constructor;
    const result: Record<string, unknown> = {};
    for (const name of klass._encryptedAttributes ?? new Set<string>()) {
      result[name] =
        typeof record.readAttribute === "function" ? record.readAttribute(name) : record[name];
    }
    return result;
  }

  /** @internal */
  static buildDecryptAttributeAssignments(record: any): Record<string, unknown> {
    const klass = record.constructor;
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
    const klass = record.constructor;
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
