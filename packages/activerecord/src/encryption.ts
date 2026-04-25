/**
 * Wiring for `Base.encrypts` — records declarations and applies them
 * to the class's attribute definitions.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypts
 *
 * In Rails, `encrypts` uses `decorate_attributes` which defers type
 * wrapping via `PendingDecorator` — the actual wrapping happens when
 * `_default_attributes` is first resolved. We mirror this with
 * `_pendingEncryptions`: `encrypts()` records the request, and
 * `applyPendingEncryptions()` runs during construction and after
 * schema reflection, wrapping any attributes that haven't been
 * wrapped yet.
 *
 * All actual encryption flows through the Rails-faithful scheme-based
 * `EncryptedAttributeType` under `./encryption/`. A custom `{ encryptor }`
 * option is adapted into a `Scheme` via a minimal encryptor shim so the
 * two flows share a single wrapper implementation.
 */

import { type Type } from "@blazetrails/activemodel";
import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { Scheme, type SchemeOptions } from "./encryption/scheme.js";
import type { EncryptorLike } from "./encryption/encryptor.js";
import { Cipher } from "./encryption/cipher/aes256-gcm.js";
import { globalPreviousSchemesFor, EncryptableRecord } from "./encryption/encryptable-record.js";
import { Configurable } from "./encryption/configurable.js";
import { withoutEncryption, getEncryptionContext } from "./encryption/context.js";

/**
 * The simple encryptor surface `Base.encrypts({ encryptor })` accepts.
 * If the encryptor implements `isEncrypted(text)` it will be consulted
 * directly; otherwise the shim probes by calling `decrypt(text)` and
 * treats a non-throwing decrypt as encrypted (see
 * `LegacyEncryptorShim.isEncrypted`). Custom encryptors whose `decrypt`
 * accepts plaintext without throwing should also implement
 * `isEncrypted(text)` to avoid misclassification.
 */
export interface Encryptor {
  encrypt(value: string): string;
  decrypt(ciphertext: string): string;
  isEncrypted?(text: string): boolean;
  isBinary?(): boolean;
}

const ENCRYPTED_PREFIX = "AR_ENC:";

export const defaultEncryptor: Encryptor = {
  encrypt(value: string): string {
    return ENCRYPTED_PREFIX + Buffer.from(value, "utf-8").toString("base64");
  },
  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(ENCRYPTED_PREFIX)) {
      throw new Error("Not an encrypted value");
    }
    return Buffer.from(ciphertext.slice(ENCRYPTED_PREFIX.length), "base64").toString("utf-8");
  },
  isEncrypted(text: string): boolean {
    return typeof text === "string" && text.startsWith(ENCRYPTED_PREFIX);
  },
};

/**
 * Adapts the simple `{ encrypt, decrypt }` pair accepted by `Base.encrypts`
 * to the wider `EncryptorLike` surface that `Scheme.encryptor` expects.
 * Options are intentionally ignored — the legacy path has no key provider
 * or deterministic mode.
 *
 * `isEncrypted()` is what `supportUnencryptedData` consults to distinguish
 * ciphertext from plaintext on read. Returning the wrong answer is
 * critical in both directions: false positive and the shim decrypts
 * plaintext (may corrupt it); false negative and it skips decryption
 * for real ciphertext (returns garbage to the caller). Resolution order:
 *
 *   1. Delegate to `inner.isEncrypted(text)` if the user supplied one —
 *      this is the only reliable answer for custom encryptors.
 *   2. Otherwise, try `inner.decrypt(text)` and treat a throw as
 *      "not encrypted". Matches Rails' own
 *      `ActiveRecord::Encryption::Encryptor#encrypted?`, which does
 *      `serializer.load(encrypted_text); true; rescue; false`.
 *
 * Two caveats with the fallback path:
 *
 * - A custom encryptor whose `decrypt` is permissive (doesn't throw
 *   on plaintext) MUST supply `isEncrypted()` to avoid misclassification.
 * - When `supportUnencryptedData` is enabled, the scheme consults
 *   `isEncrypted()` before decrypting, so the fallback path runs
 *   `decrypt` once for the probe and once for real — roughly 2x the
 *   CPU. Rails avoids this by probing with `serializer.load` (cheap
 *   parse, no cipher), but the simple `{ encrypt, decrypt }` surface
 *   has no equivalent cheap probe. Supplying `isEncrypted()` eliminates
 *   the double work; consider doing so in perf-sensitive paths.
 */
class LegacyEncryptorShim implements EncryptorLike {
  constructor(private readonly inner: Encryptor) {}

  encrypt(clearText: string, _options?: Record<string, unknown>): string {
    return this.inner.encrypt(clearText);
  }

  decrypt(encryptedText: string, _options?: Record<string, unknown>): string {
    return this.inner.decrypt(encryptedText);
  }

  isEncrypted(text: string): boolean {
    if (this.inner.isEncrypted) return this.inner.isEncrypted(text);
    try {
      this.inner.decrypt(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return this.inner.isBinary?.() ?? false;
  }
}

/**
 * The options bag `Base.encrypts` accepts. Mirrors Rails' kwargs:
 * full `SchemeOptions` (key, keyProvider, deterministic, downcase,
 * ignoreCase, previousSchemes, compress, compressor) plus the repo's
 * backwards-compatible `{ encryptor }` extension for users who supply
 * a simple `{ encrypt, decrypt }` pair without configuring a Scheme.
 */
export interface EncryptsOptions extends Omit<SchemeOptions, "encryptor"> {
  encryptor?: Encryptor;
}

function buildScheme(options: EncryptsOptions): Scheme {
  const { encryptor, previousSchemes: localPrevious = [], ...schemeOptions } = options;

  const hasSchemeOptions =
    schemeOptions.key !== undefined ||
    schemeOptions.keyProvider !== undefined ||
    schemeOptions.deterministic !== undefined ||
    schemeOptions.downcase !== undefined ||
    schemeOptions.ignoreCase !== undefined ||
    localPrevious.length > 0 ||
    schemeOptions.compress !== undefined ||
    schemeOptions.compressor !== undefined ||
    schemeOptions.supportUnencryptedData !== undefined;

  // Switch to the real Scheme whenever any encryption key material is configured.
  // If config is incomplete (e.g. only keyDerivationSalt set, no primaryKey),
  // Scheme._defaultKeyProvider() returns undefined and Encryptor raises
  // "No encryption key provided" at serialize/deserialize time — still more
  // informative than silently storing AR_ENC:base64 data.
  const { primaryKey, deterministicKey, keyDerivationSalt } = Configurable.config;
  const hasConfiguredKeys =
    primaryKey !== undefined || deterministicKey !== undefined || keyDerivationSalt !== undefined;

  const coreOpts: SchemeOptions = encryptor
    ? { ...schemeOptions, encryptor: new LegacyEncryptorShim(encryptor) }
    : hasSchemeOptions || hasConfiguredKeys
      ? schemeOptions
      : { encryptor: new LegacyEncryptorShim(defaultEncryptor) };

  const base = new Scheme(coreOpts);
  const globalPrevious = globalPreviousSchemesFor(base);
  const allPrevious = [...globalPrevious, ...localPrevious];
  return allPrevious.length > 0 ? new Scheme({ ...coreOpts, previousSchemes: allPrevious }) : base;
}

interface PendingEncryption {
  name: string;
  scheme: Scheme;
}

/**
 * Declare one or more attributes as encrypted on a model class.
 *
 * Like Rails' `decorate_attributes`, this defers the actual type wrapping.
 * Pending encryptions are applied when the attribute definitions are
 * first used (via `applyPendingEncryptions`).
 */
export function encrypts(klass: any, ...args: Array<string | EncryptsOptions>): void {
  let options: EncryptsOptions = {};
  const names: string[] = [];

  for (const arg of args) {
    if (typeof arg === "string") {
      names.push(arg);
    } else if (arg && typeof arg === "object") {
      options = arg;
    }
  }

  const scheme = buildScheme(options);

  if (!Object.prototype.hasOwnProperty.call(klass, "_pendingEncryptions")) {
    klass._pendingEncryptions = [...(klass._pendingEncryptions ?? [])];
  }

  // Own-property guard mirrors the `_pendingEncryptions` pattern — a
  // subclass encrypting a new attribute must not mutate the parent's
  // (or a sibling's) Set. Matches Rails' `class_attribute` semantics.
  if (!Object.prototype.hasOwnProperty.call(klass, "_encryptedAttributes")) {
    klass._encryptedAttributes = new Set<string>(klass._encryptedAttributes ?? []);
  }

  for (const name of names) {
    klass._pendingEncryptions.push({ name, scheme });
    klass._encryptedAttributes.add(name);
    if (Configurable.config.validateColumnSize) {
      EncryptableRecord.validateColumnSize(klass, name);
    }
  }

  if (klass._attributeDefinitions?.size > 0) {
    applyPendingEncryptions(klass);
  }
}

/**
 * Apply any pending encryption decorations to the class's attribute
 * definitions. Wraps the existing cast type with the scheme-based
 * `EncryptedAttributeType`.
 */
export function applyPendingEncryptions(klass: any): void {
  const pending: PendingEncryption[] | undefined = klass._pendingEncryptions;
  if (!pending || pending.length === 0) return;

  if (!Object.prototype.hasOwnProperty.call(klass, "_attributeDefinitions")) {
    klass._attributeDefinitions = new Map(klass._attributeDefinitions);
  }

  for (const { name, scheme } of pending) {
    const def = klass._attributeDefinitions.get(name);
    if (!def) continue;
    // Guard prevents double-decoration both in _attributeDefinitions and
    // in the pending queue (decorateAttributes is idempotent here because
    // the encryptedType guard on _attributeDefinitions prevents re-entry).
    if (def.type instanceof EncryptedAttributeType) continue;
    // Route through decorateAttributes so the encryption PendingDecorator
    // lands in the pending queue in declaration order (after any PendingType),
    // ensuring _defaultAttributes replays correctly.
    klass.decorateAttributes(
      [name],
      (_attrName: string, castType: Type) => new EncryptedAttributeType({ scheme, castType }),
    );
  }

  // Re-run column-size validation after schema reflection so limits learned
  // from the DB (not declared via attribute()) are also picked up. Safe even
  // if validateColumnSize already ran at encrypts() time — it guards against
  // registering the same LengthValidator twice.
  if (Configurable.config.validateColumnSize) {
    for (const { name } of pending) {
      EncryptableRecord.validateColumnSize(klass, name);
    }
  }

  // Register the frozen-encryption validator once per class. Own-property check
  // so subclasses that have already snapped their callback chain don't miss it —
  // if a subclass cloned _callbackChain before the parent installed this
  // validator, `in` would suppress installation even though the clone lacks it.
  // The validator reads `record.constructor._encryptedAttributes` at call time,
  // so it correctly handles STI subclasses with different encrypted attribute sets.
  if (
    !Object.prototype.hasOwnProperty.call(klass, "_frozenEncryptionValidatorInstalled") &&
    typeof klass.validate === "function"
  ) {
    klass._frozenEncryptionValidatorInstalled = true;
    klass.validate((record: any) => {
      if (!getEncryptionContext().frozenEncryption) return;
      // Use record.constructor so STI subclasses consult their own
      // encrypted_attributes list — mirrors Rails' self.class.encrypted_attributes.
      const encryptedAttrs: Set<string> =
        (record.constructor as any)._encryptedAttributes ?? new Set();
      const changed: string[] = Array.isArray(record.changedAttributes)
        ? record.changedAttributes
        : [];
      for (const attr of changed) {
        if (encryptedAttrs.has(attr)) {
          record.errors.add(attr, "can't be modified because it is encrypted");
        }
      }
    });
  }
}

/**
 * Check if an attribute is encrypted on a class (pending or applied).
 */
export function isEncryptedAttribute(klass: any, attr: string): boolean {
  let current = klass;
  while (current) {
    const pending: PendingEncryption[] | undefined = current._pendingEncryptions;
    if (pending?.some((p) => p.name === attr)) return true;
    const defs = current._attributeDefinitions;
    if (defs) {
      const def = defs.get(attr);
      if (def?.type instanceof EncryptedAttributeType) return true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

// ─── Instance-level encryption API ──────────────────────────────────────────

/**
 * Returns true if the attribute's current stored value is encrypted ciphertext.
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypted_attribute?
 */
export function encryptedAttributeQ(record: any, attributeName: string): boolean {
  const klass = record.constructor as any;
  // Resolve attribute aliases (mirrors Rails' attribute_aliases lookup).
  const resolved = klass._attributeAliases?.[attributeName] ?? attributeName;
  if (!klass._encryptedAttributes?.has(resolved)) return false;
  const type = klass._attributeDefinitions?.get(resolved)?.type;
  if (!(type instanceof EncryptedAttributeType)) return false;
  const rawValue = record.readAttributeBeforeTypeCast(resolved);
  return type.isEncrypted(rawValue);
}

/**
 * Returns the ciphertext for the given attribute.
 * For encrypted attributes: returns the raw (before-type-cast) stored value.
 * For unencrypted attributes: returns the serialized DB value.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#ciphertext_for
 */
export function ciphertextFor(record: any, attributeName: string): unknown {
  const klass = record.constructor as any;
  const resolved = klass._attributeAliases?.[attributeName] ?? attributeName;
  if (encryptedAttributeQ(record, attributeName)) {
    return record.readAttributeBeforeTypeCast(resolved);
  }
  return record._attributes.valuesForDatabase()[resolved];
}

/**
 * Encrypts all encryptable attributes and persists them via update_columns.
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypt
 */
export async function encryptRecord(record: any): Promise<void> {
  const klass = record.constructor as any;
  const encryptedAttrs: Set<string> = klass._encryptedAttributes ?? new Set();
  if (encryptedAttrs.size === 0) return;

  // Save plaintext values before calling updateColumns, which would overwrite
  // in-memory attributes with the ciphertext (since updateColumns uses cast()).
  const plaintextValues: Record<string, unknown> = {};
  const assignments: Record<string, unknown> = {};
  for (const attr of encryptedAttrs) {
    const plaintext = record.readAttribute(attr);
    plaintextValues[attr] = plaintext;
    // Explicitly serialize via the type so updateColumns writes ciphertext —
    // updateColumns uses cast() not serialize(), so we pre-serialize here.
    const type = klass._attributeDefinitions?.get(attr)?.type;
    assignments[attr] =
      type instanceof EncryptedAttributeType ? type.serialize(plaintext) : plaintext;
  }

  await record.updateColumns(assignments);

  // Restore plaintext as the in-memory cast value so record.attr still reads
  // as plaintext, while preserving the ciphertext as valueBeforeTypeCast
  // (used by encryptedAttribute? / ciphertextFor on this instance).
  for (const [attr, plaintext] of Object.entries(plaintextValues)) {
    record._attributes.writeCastValue(attr, plaintext);
  }
  // Re-snapshot the dirty tracker so it sees the restored plaintext as the
  // clean state — updateColumns already called changesApplied() with the
  // ciphertext values, which would make subsequent attribute writes appear
  // to change "from" the ciphertext rather than the plaintext.
  record.changesApplied();
}

/**
 * Decrypts all encryptable attributes and persists them via update_columns
 * (with encryption disabled, matching Rails' without_encryption block).
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#decrypt
 */
export async function decryptRecord(record: any): Promise<void> {
  const klass = record.constructor as any;
  const encryptedAttrs: Set<string> = klass._encryptedAttributes ?? new Set();
  if (encryptedAttrs.size === 0) return;

  const assignments: Record<string, unknown> = {};
  for (const attr of encryptedAttrs) {
    const type = klass._attributeDefinitions?.get(attr)?.type;
    const raw = record.readAttributeBeforeTypeCast(attr);
    if (type instanceof EncryptedAttributeType && type.isEncrypted(raw)) {
      assignments[attr] = type.deserialize(raw);
    } else {
      assignments[attr] = record.readAttribute(attr);
    }
  }
  await withoutEncryption(() => record.updateColumns(assignments));
}

/** Mirrors: ActiveRecord::Encryption.key_length */
export function keyLength(): number {
  return Cipher.keyLength;
}

/** Mirrors: ActiveRecord::Encryption.iv_length */
export function ivLength(): number {
  return Cipher.ivLength;
}

/** Mirrors: ActiveRecord::Encryption.eager_load! */
export function eagerLoadBang(): void {
  // No-op in TS — all encryption classes are statically imported.
}
