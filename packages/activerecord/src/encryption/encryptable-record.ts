import { Scheme, type SchemeOptions } from "./scheme.js";
import { Contexts } from "./contexts.js";
import { Configuration as ConfigurationError } from "./errors.js";
import { LengthValidator, type Type } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { Configurable } from "./configurable.js";
import { encryptionHooks } from "../encryption-hooks.js";

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
  return Configurable.config.previousSchemes
    .filter((previousScheme) => scheme.isCompatibleWith(previousScheme))
    .map((previousScheme) => scheme.merge(previousScheme));
}

/**
 * Mirrors Rails' EncryptableRecord#scheme_for (encryptable_record.rb:70-76):
 * the scheme is built from the declared options alone, then `previousSchemes`
 * is assigned in one shot, globals first. Assigning it here — rather than
 * resolving globals at type-read time — is what makes it frozen by
 * construction, which is what lets EncryptedAttributeType memoize.
 *
 * @internal
 */
function schemeFor(options: SchemeOptions): Scheme {
  const { previousSchemes: previous = [], ...rest } = options;
  const scheme = new Scheme(rest);
  scheme.previousSchemes = [...globalPreviousSchemesFor(scheme), ...previous];
  return scheme;
}

/**
 * One `encrypts` declaration's bookkeeping, read back off `_pendingEncryptions`
 * by `fixtures.ts` and `applyPendingEncryptions`.
 *
 * `scheme` is a getter, and unmemoized, because Rails calls `scheme_for` inside
 * the `decorate_attributes` block (encryptable_record.rb:85-95): the scheme is
 * built when the attribute type is resolved, and rebuilt on every replay, not
 * when `encrypts` is called. That is what lets a `configure` between the two
 * contribute its global previous schemes — "encryption schemes are resolved when
 * used, not when declared" (encryptable_record_test.rb:388). A memo here would
 * pin the pre-`configure` answer, the way the retired `_globalPreviousSchemesFn`
 * injection point did one level up.
 */
interface PendingEncryption {
  name: string;
  readonly scheme: Scheme;
}

const ORIGINAL_ATTRIBUTE_PREFIX = "original_";

// Sentinel distinguishing "column not reflected in the warm cache" from a
// genuinely-cached `undefined`/`null` column default. Lets columnDefaultFor
// fall back to the def default only when the schema cache has no answer.
const NOT_CACHED = Symbol("encryption.columnDefault.notCached");

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
   * `class_attribute :encrypted_attributes` (encryptable_record.rb:11) also
   * generates the predicate, whose body is `!!encrypted_attributes` — true once
   * the slot has been assigned (`self.encrypted_attributes ||= Set.new`,
   * encryptable_record.rb:50), including for an assigned-but-empty Set. That is
   * NOT `has_encrypted_attributes?`, which is `present?` and so false when the
   * Set is empty (encryptable_record.rb:204-206). The reader's `?? new Set()`
   * default can't answer it, so read the slot directly.
   */
  static isEncryptedAttributes(modelClass: any): boolean {
    return modelClass._encryptedAttributes != null;
  }

  static sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined {
    return attributeName.startsWith(ORIGINAL_ATTRIBUTE_PREFIX)
      ? attributeName.slice(ORIGINAL_ATTRIBUTE_PREFIX.length)
      : undefined;
  }

  /**
   * Record a pending encryption so `applyPendingEncryptions` (encryption.ts)
   * re-runs its bookkeeping on every `_defaultAttributes` rebuild. The `scheme`
   * is kept in each entry for `encryptFixtureRows` (define-fixtures.ts).
   * @internal
   */
  static registerPendingEncryption(modelClass: any, pending: PendingEncryption): void {
    if (!Object.prototype.hasOwnProperty.call(modelClass, "_pendingEncryptions")) {
      modelClass._pendingEncryptions = [...(modelClass._pendingEncryptions ?? [])];
    }
    modelClass._pendingEncryptions.push(pending);
  }

  /**
   * Push the durable encryption PendingDecorator, exactly once per `encrypts`
   * declaration — mirroring Rails' `decorate_attributes([name]) { ... }` in
   * encryptable_record.rb:87-92. Pushing at declaration time (not on the first
   * post-reflection rebuild, as before) keeps the decorator's queue position —
   * and therefore the resolved nesting relative to `serialize` — in declaration
   * order, and bounds the queue: repeated `_defaultAttributes` rebuilds never
   * re-push (`registerEncryptedType` no longer touches the queue).
   *
   * The column default is resolved inside the decorator at replay time
   * (mirrors Rails' `default: columns_hash[name.to_s]&.default`, evaluated in
   * the block), so a replay after schema reflection picks up the authoritative
   * DB default without any re-push.
   * @internal
   */
  static pushEncryptionDecorator(modelClass: any, name: string, pending: PendingEncryption): void {
    modelClass.decorateAttributes([name], (attrName: string, castType: Type, host?: unknown) => {
      // Idempotence guard for the eager immediate-apply pass (a fresh-seed
      // replay applies each queued decorator once, but `decorateAttributes`
      // also applies eagerly to a possibly already-wrapped definitions view).
      if (castType instanceof EncryptedAttributeType) return null as unknown as Type;
      const target = host ?? modelClass;
      return new EncryptedAttributeType({
        scheme: pending.scheme,
        castType,
        default: this.columnDefaultFor(
          target,
          attrName,
          (target as { _attributeDefinitions?: Map<string, unknown> })._attributeDefinitions?.get?.(
            attrName,
          ),
        ),
      });
    });
  }

  /**
   * Register the EncryptedAttributeType for a plain mock model (the immediate
   * path in `encryptAttribute` — callers without `decorateAttributes`). Real
   * Base subclasses never come through here: their wrapping is the durable
   * decorator pushed by `pushEncryptionDecorator`, resolved via
   * `typeForAttribute`.
   * @internal
   */
  static registerEncryptedType(modelClass: any, name: string, scheme: Scheme): void {
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
      default: this.columnDefaultFor(modelClass, name, existingDef),
    });

    // Register directly into _attributeDefinitions (not via attribute()
    // which expects a string type name).
    if (modelClass._attributeDefinitions?.set) {
      modelClass._attributeDefinitions.set(name, {
        name,
        type: encryptedType,
        defaultValue: existingDef?.defaultValue ?? null,
        userProvidedDefault: existingDef?.userProvidedDefault ?? false,
        ...(existingDef?.limit != null ? { limit: existingDef.limit } : {}),
      });
    }
  }

  /**
   * Resolve the column's schema default, mirroring Rails'
   * `default: columns_hash[name.to_s]&.default` (encryptable_record.rb:91).
   *
   * Rails threads the TRUE DB column default — not the possibly-overridden
   * `attribute(name, { default: X })` value. When a model declares an
   * `attribute()` default that differs from the column default, the reflected
   * def's `defaultValue` holds the override, so reading it would thread the
   * wrong value into `EncryptedAttributeType`.
   *
   * So we first peek the already-warm schema cache (query-free, no
   * `loadSchema`/`columnsHash` — those warm the shared cache and perturb
   * sibling encryption tests). If the column is reflected there, its `.default`
   * is the authoritative DB default. Otherwise (plain mock models, or a def
   * seen before reflection) we fall back to the def's `defaultValue` — which,
   * absent an `attribute()` override, already carries the column default.
   * Returns undefined (Rails' nil default) when neither yields a value.
   * @internal
   */
  static columnDefaultFor(modelClass: any, name: string, def: any): unknown {
    const cached = this.cachedColumnDefaultFor(modelClass, name);
    if (cached !== NOT_CACHED) return cached ?? undefined;
    return def?.defaultValue ?? undefined;
  }

  /**
   * Query-free peek of a reflected column's DB default from the raw schema
   * cache, WITHOUT leasing a connection or calling `loadSchema` (either would
   * warm the shared cache — see the story's sibling-perturbation note). Resolves
   * the raw sync `SchemaCache` the same connection-less way
   * `reset_column_information` does: a directly-assigned `_adapter`, else the
   * pool config's cache slot. Returns `NOT_CACHED` when the table isn't warm
   * yet or the column isn't present, so callers fall back to the def default.
   * @internal
   */
  static cachedColumnDefaultFor(modelClass: any, name: string): unknown {
    try {
      const table: string | undefined = modelClass?.tableName;
      if (!table) return NOT_CACHED;
      const direct = modelClass._adapter as
        | { internalSchemaCache?: { getCachedColumnsHash?: (t: string) => any } }
        | undefined;
      const cache =
        direct?.internalSchemaCache ??
        modelClass.connectionPool?.()?.poolConfig?.schemaCache ??
        undefined;
      if (typeof cache?.getCachedColumnsHash !== "function") return NOT_CACHED;
      const columns = cache.getCachedColumnsHash(table);
      const column = columns?.[name];
      if (!column) return NOT_CACHED;
      return column.default ?? undefined;
    } catch {
      return NOT_CACHED;
    }
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

  /**
   * Re-run the `original_<name>` missing-column requirement for every
   * ignoreCase-preserved attribute against the authoritative column set
   * reflected from the real adapter schema. Driven from schema reflection
   * (`applyColumnsHash`), which runs only once the DB columns are known — so
   * unlike the eager `columnNames()` partial-load path, `reflectedColumnNames`
   * distinguishes "schema reflected, column absent" (fail-closed, raise) from
   * "declaration in progress" (never reaches here). Mirrors Rails' fail-closed
   * `preserve_original_encrypted`, whose `column_names` is always complete.
   * @internal
   */
  static requireOriginalColumnsAfterReflection(
    modelClass: any,
    reflectedColumnNames: string[],
  ): void {
    // Read is intentionally NOT own-property-guarded (unlike the write in
    // preserveOriginalEncrypted): an STI subclass with no ignoreCase
    // declarations of its own should still enforce the base's preserved
    // attributes, so we deliberately resolve the inherited Set via the
    // prototype chain.
    const preserved: Set<string> | undefined = modelClass._ignoreCasePreservedAttributes;
    if (!preserved || preserved.size === 0) return;
    for (const name of preserved) {
      this.requireOriginalColumnPresent(modelClass, name, reflectedColumnNames);
    }
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
        const changed: string[] = Array.isArray(record.changedAttributeNamesToSave)
          ? record.changedAttributeNamesToSave
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
      validateColumnSize.call(modelClass, name);
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
    const merged = [...new Set<string>([...names, ...[...encryptedAttrs].map(String)])];
    return record._createRecord?.(merged);
  }

  /** @internal */
  static cantModifyEncryptedAttributesWhenFrozen(record: any): void {
    const klass = record.constructor;
    const encryptedAttrs: Set<string> = klass._encryptedAttributes ?? new Set();
    // changedAttributeNamesToSave is the string[] of changed attribute names.
    // Iterate changed once and check Set membership — O(n+m) vs O(n×m).
    const changed: string[] = Array.isArray(record.changedAttributeNamesToSave)
      ? record.changedAttributeNamesToSave
      : [];
    for (const attr of changed) {
      if (encryptedAttrs.has(attr)) {
        record.errors?.add?.(attr, "can't be modified because it is encrypted");
      }
    }
  }
}

/**
 * Mirrors: ...EncryptableRecord::ClassMethods#validate_column_size
 * (encryptable_record.rb:138-142). `this` is the model class.
 *
 * @internal
 */
export function validateColumnSize(this: any, attributeName: string): void {
  if (typeof this.validatesLengthOf !== "function") return;
  const limit = this._attributeDefinitions?.get(attributeName)?.limit;
  if (limit == null) return;
  // Guard against double registration (called at encrypts() time and again
  // after schema reflection). Check whether a LengthValidator with this
  // exact maximum already exists for the attribute.
  const existing: unknown[] = this._validators?.get(attributeName) ?? [];
  const alreadyRegistered = existing.some(
    (v: unknown) => v instanceof LengthValidator && (v as any).options?.maximum === limit,
  );
  if (!alreadyRegistered) {
    this.validatesLengthOf(attributeName, { maximum: limit });
  }
}

/**
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord::ClassMethods#encrypts
 * (encryptable_record.rb:49-55). `this` is the model class, the receiver Ruby's
 * `class_methods do` block gives the method.
 */
export function encrypts(this: any, ...namesAndOptions: unknown[]): void {
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
    encryptAttribute.call(this, name, options);
  }
}

/**
 * The `class_attribute :encrypted_attributes` reader (encryptable_record.rb:11).
 * `this` is the model class; the slot is inherited through the prototype chain,
 * matching `class_attribute`'s subclass visibility.
 */
export function encryptedAttributes(this: any): Set<string> {
  return this._encryptedAttributes ?? new Set<string>();
}

/**
 * Mirrors: ...::ClassMethods#deterministic_encrypted_attributes
 * (encryptable_record.rb:58-62).
 */
export function deterministicEncryptedAttributes(this: any): Set<string> {
  // Memoized per class like Rails' `@deterministic_encrypted_attributes ||=`
  // (encryptable_record.rb:58-61); own-property-guarded so STI subclasses
  // compute their own. Invalidated by `encryptAttribute` on new declarations.
  if (Object.prototype.hasOwnProperty.call(this, "_deterministicEncryptedAttributes")) {
    return this._deterministicEncryptedAttributes;
  }
  const result = new Set<string>();
  for (const attributeName of encryptedAttributes.call(this)) {
    const type = encryptedTypeOf(getAttributeType(this, attributeName));
    if (type?.deterministic) {
      result.add(attributeName);
    }
  }
  this._deterministicEncryptedAttributes = result;
  return result;
}

/**
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypted_attribute?
 * (encryptable_record.rb:146-154). `this` is the record.
 *
 * @internal
 */
export function encryptedAttribute(this: any, attributeName: string): boolean {
  const name = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (!encryptedAttributes.call(this.constructor).has(name)) return false;
  // `encryptedTypeOf` unwraps the resolved type: unlike Ruby's DelegateClass,
  // a TS `Serialized(Encrypted(...))` does not forward `encrypted?`.
  const type = encryptedTypeOf(this.constructor.typeForAttribute(name));
  if (!type) return false;
  return type.isEncrypted(this.readAttributeBeforeTypeCast?.(name));
}

/**
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#ciphertext_for
 * (encryptable_record.rb:157-163).
 *
 * @internal
 */
export function ciphertextFor(this: any, attributeName: string): unknown {
  attributeName = this.constructor.attributeAliases?.[attributeName] ?? attributeName;
  if (encryptedAttribute.call(this, attributeName)) {
    return this.readAttributeBeforeTypeCast?.(attributeName);
  }
  return this.readAttributeForDatabase(attributeName);
}

/**
 * Mirrors: ...EncryptableRecord#encrypt (encryptable_record.rb:166-168).
 *
 * @internal
 */
export async function encrypt(this: any): Promise<void> {
  if (hasEncryptedAttributes.call(this)) {
    await encryptAttributes.call(this);
  }
}

/**
 * Mirrors: ...EncryptableRecord#decrypt (encryptable_record.rb:171-173).
 *
 * @internal
 */
export async function decrypt(this: any): Promise<void> {
  if (hasEncryptedAttributes.call(this)) {
    await decryptAttributes.call(this);
  }
}

/**
 * Mirrors: ...EncryptableRecord#encrypt_attributes (encryptable_record.rb:187-191).
 *
 * @internal
 */
export async function encryptAttributes(this: any): Promise<void> {
  validateEncryptionAllowed.call(this);

  // buildEncryptAttributeAssignments returns plaintext values; updateColumns
  // writes them as the in-memory cast value and serializes each (via
  // SerializeCastValue.serialize) to ciphertext for the DB write.
  await this.updateColumns(buildEncryptAttributeAssignments.call(this));
}

/**
 * Mirrors: ...EncryptableRecord#decrypt_attributes (encryptable_record.rb:193-198).
 *
 * @internal
 */
export async function decryptAttributes(this: any): Promise<void> {
  validateEncryptionAllowed.call(this);

  const decryptAttributeAssignments = buildDecryptAttributeAssignments.call(this);
  await Contexts.withoutEncryption(() => this.updateColumns(decryptAttributeAssignments));
}

/**
 * Mirrors: ...EncryptableRecord#validate_encryption_allowed (encryptable_record.rb:200-202).
 *
 * @internal
 */
export function validateEncryptionAllowed(this: any): void {
  if (Contexts.context.frozenEncryption) {
    throw new ConfigurationError("can't be modified because it is encrypted");
  }
}

/**
 * Mirrors: ...EncryptableRecord#has_encrypted_attributes? (encryptable_record.rb:204-206).
 *
 * @internal
 */
export function hasEncryptedAttributes(this: any): boolean {
  return encryptedAttributes.call(this.constructor).size > 0;
}

/**
 * Mirrors: ...#build_encrypt_attribute_assignments (encryptable_record.rb:208-212).
 *
 * @internal
 */
export function buildEncryptAttributeAssignments(this: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attributeName of encryptedAttributes.call(this.constructor)) {
    result[attributeName] =
      typeof this.readAttribute === "function"
        ? this.readAttribute(attributeName)
        : this[attributeName];
  }
  return result;
}

/**
 * Mirrors: ...#build_decrypt_attribute_assignments (encryptable_record.rb:214-221).
 *
 * @internal
 */
export function buildDecryptAttributeAssignments(this: any): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const attributeName of encryptedAttributes.call(this.constructor)) {
    const type = getAttributeType(this.constructor, attributeName) as {
      deserialize: (v: unknown) => unknown;
    };
    const encryptedValue = ciphertextFor.call(this, attributeName);
    result[attributeName] = type.deserialize(encryptedValue);
  }
  return result;
}

/**
 * The single declaration path for encrypted attributes — both `Base.encrypts`
 * (via encryption.ts#encrypts) and direct callers route through here, mirroring
 * Rails' single `encrypt_attribute`.
 *
 * The scheme is built by `schemeFor` — Rails' one `scheme_for` — inside the
 * `PendingEncryption` getter, because Rails calls `scheme_for` inside the
 * `decorate_attributes` block (encryptable_record.rb:85-88).
 *
 * @internal
 */
export function encryptAttribute(this: any, name: string, options: SchemeOptions = {}): void {
  const modelClass = this;
  // Own-property guard mirrors Rails' `class_attribute` semantics — a subclass
  // encrypting a new attribute must not mutate the parent's (or a sibling's) Set.
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_encryptedAttributes")) {
    modelClass._encryptedAttributes = new Set<string>(modelClass._encryptedAttributes ?? []);
  }
  modelClass._encryptedAttributes.add(name);
  delete modelClass._deterministicEncryptedAttributes;

  const pending: PendingEncryption = {
    name,
    get scheme(): Scheme {
      return schemeFor(options);
    },
  };

  if (typeof modelClass.decorateAttributes === "function") {
    // Durable path (real model classes): push the durable PendingDecorator NOW,
    // at declaration time, so its position in the pending queue tracks
    // declaration order relative to `serialize` / `normalizes` — mirroring
    // Rails, where `encrypts` calls `decorate_attributes` inline
    // (encryptable_record.rb:87-92) and AttributeRegistration replays in
    // declaration order. The decorator resolves the column default at replay
    // time, so it needs no re-push after schema reflection. The
    // `_pendingEncryptions` buffer remains only for validator re-runs +
    // frozen-validator install on rebuild (applyPendingEncryptions).
    EncryptableRecord.registerPendingEncryption(this, pending);
    EncryptableRecord.pushEncryptionDecorator(this, name, pending);
    encryptionHooks.applyPendingEncryptions(modelClass);
  } else {
    // Immediate path (plain-object callers without decoration machinery, e.g.
    // direct `EncryptableRecord.encrypts` tests): register the encrypted type
    // synchronously so it's readable right after the call.
    EncryptableRecord.registerEncryptedType(this, name, pending.scheme);
  }

  if (Configurable.config.validateColumnSize) {
    validateColumnSize.call(this, name);
  }

  // Mirrors Rails encryptable_record.rb:94 —
  // `preserve_original_encrypted(name) if ignore_case`. Wires the
  // case-preserving `original_<name>` column when the attribute is declared
  // with ignoreCase, so reads return the true-cased value.
  if (options.ignoreCase) {
    preserveOriginalEncrypted.call(this, name);
  }

  Configurable.encryptedAttributeWasDeclared(this, name);
}

/**
 * Mirrors Rails' EncryptableRecord::ClassMethods#preserve_original_encrypted.
 * Declares the case-preserving `original_<name>` encrypted column and
 * overrides the accessors so reads return the original-cased value.
 * @internal
 */
export function preserveOriginalEncrypted(this: any, name: string): void {
  const modelClass = this;
  const originalAttributeName = `${ORIGINAL_ATTRIBUTE_PREFIX}${name}`;
  // Record the source attribute so the post-reflection hook
  // (`requireOriginalColumnsAfterReflection`, driven from schema reflection)
  // can re-run the missing-column check against the authoritative DB column
  // set — closing the fail-open gap when the adapter isn't connected at
  // declaration time. Own-property guarded like `_encryptedAttributes` so a
  // subclass declaring ignoreCase doesn't mutate the parent's Set.
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_ignoreCasePreservedAttributes")) {
    modelClass._ignoreCasePreservedAttributes = new Set<string>(
      modelClass._ignoreCasePreservedAttributes ?? [],
    );
  }
  modelClass._ignoreCasePreservedAttributes.add(name);

  // Enforce the missing-column requirement against the columns known now.
  // `columnNames()` forces a schema load when an adapter is connected, so the
  // check fires for real models; at Base.encrypts static-init with no adapter
  // it returns [] and requireOriginalColumnPresent defers (see its doc) — the
  // post-reflection hook above then catches a genuinely absent column.
  EncryptableRecord.requireOriginalColumnPresent(this, name, this.columnNames?.() ?? []);

  // Declare original_<name> with a default scheme, mirroring Rails' bare
  // `encrypts original_attribute_name` (encryptable_record.rb:105 — no kwargs).
  // encryptAttribute's durable branch buffers this in _pendingEncryptions so
  // the original column rides the same replay-safe machinery as its source.
  encrypts.call(this, originalAttributeName);
  EncryptableRecord.overrideAccessorsToPreserveOriginal(this, name, originalAttributeName);
}

/**
 * Resolve an attribute's type through `typeForAttribute` (Rails' single lookup
 * surface); falls back to `_attributeDefinitions` for plain mock models.
 */
export function getAttributeType(klass: any, name: string): unknown {
  if (typeof klass?.typeForAttribute === "function") {
    return klass.typeForAttribute(name);
  }
  return klass._attributeDefinitions?.get?.(name)?.type;
}

/**
 * Find the EncryptedAttributeType inside a possibly-wrapped resolved type
 * (e.g. `Serialized(Encrypted(binary))`). Stands in for Rails' DelegateClass
 * delegation on Type::Serialized / NormalizedValueType.
 */
export function encryptedTypeOf(type: unknown): EncryptedAttributeType | undefined {
  let current: any = type;
  while (current) {
    if (current instanceof EncryptedAttributeType) return current;
    current = current.subtype ?? current.castType;
  }
  return undefined;
}
