/**
 * Wiring for `Base.encrypts` — records declarations and applies them
 * to the class's attribute definitions.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypts
 *
 * In Rails, `encrypts` uses `decorate_attributes` which defers type
 * wrapping via `PendingDecorator` — the actual wrapping happens when
 * `_default_attributes` is resolved, and `type_for_attribute` is the only
 * lookup surface. We mirror that directly: `encryptAttribute` pushes the
 * durable decorator once at declaration time and type inspections resolve
 * through `typeForAttribute`. The `_pendingEncryptions` buffer only drives
 * `applyPendingEncryptions()` bookkeeping (column-size validation re-runs
 * after schema reflection + the frozen-encryption validator install).
 *
 * All actual encryption flows through the Rails-faithful scheme-based
 * `EncryptedAttributeType` under `./encryption/`. A custom `{ encryptor }`
 * option is adapted into a `Scheme` via a minimal encryptor shim so the
 * two flows share a single wrapper implementation.
 */

import { registerEncryptionHooks } from "./encryption-hooks.js";
import { Scheme, type SchemeOptions } from "./encryption/scheme.js";
import type { EncryptorLike } from "./encryption/encryptor.js";
import { Aes256Gcm as AesGcmCipher } from "./encryption/cipher/aes256-gcm.js";
export { Cipher } from "./encryption/cipher.js";
import { EncryptableRecord, encryptedTypeOf } from "./encryption/encryptable-record.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
import {
  getEncryptionContext,
  getDefaultContext,
  setDefaultContext,
  type EncryptionContext,
} from "./encryption/context.js";
import type { Config } from "./encryption/config.js";

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

  // Only pass locally-declared previous schemes — global ones are resolved lazily
  // in EncryptedAttributeType at serialize/deserialize time.
  return localPrevious.length > 0
    ? new Scheme({ ...coreOpts, previousSchemes: localPrevious })
    : new Scheme(coreOpts);
}

interface PendingEncryption {
  name: string;
  scheme: Scheme;
}

/**
 * Declare one or more attributes as encrypted on a model class.
 *
 * Routes each attribute through the shared `EncryptableRecord.encryptAttribute`
 * (single declaration path, mirroring Rails' single `encrypts`), passing a
 * scheme built by `buildScheme` so the legacy `{ encrypt, decrypt }` shim and
 * defaultEncryptor fallback are preserved on the primary path.
 *
 * The actual type wrapping is deferred (Rails' `decorate_attributes` /
 * PendingDecorator) — `encryptAttribute` pushes the durable decorator once at
 * declaration time; the wrapped type materializes on `_defaultAttributes`
 * replay and is read through `typeForAttribute`.
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
  // Drop the legacy `encryptor` field so the remaining shape is assignable to
  // SchemeOptions — the scheme is already built, so `encryptAttribute` only
  // reads `options.ignoreCase` from here.
  const { encryptor: _encryptor, ...schemeOptions } = options;

  for (const name of names) {
    EncryptableRecord.encryptAttribute(klass, name, schemeOptions, scheme);
  }
}

/**
 * Post-declaration / post-reflection bookkeeping for encrypted attributes.
 *
 * The type wrapping itself is NOT done here: `encryptAttribute` pushes the
 * durable PendingDecorator once at declaration time, and every type inspection
 * resolves through `typeForAttribute` (Rails' single lookup surface) — there is
 * no eager `_attributeDefinitions` re-wrap to maintain. What remains is the
 * bookkeeping Rails runs from `load_schema!` / `validate`: column-size
 * validation re-runs and the frozen-encryption validator install.
 */
export function applyPendingEncryptions(klass: any): void {
  const pending: PendingEncryption[] | undefined = klass._pendingEncryptions;
  if (!pending || pending.length === 0) return;

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
  // if a subclass registered callbacks before the parent installed this
  // validator, `in` would suppress installation even though the subclass lacks it.
  // The validator reads `record.constructor._encryptedAttributes` at call time,
  // so it correctly handles STI subclasses with different encrypted attribute sets.
  if (
    !Object.prototype.hasOwnProperty.call(klass, "_frozenEncryptionValidatorInstalled") &&
    typeof klass.validate === "function"
  ) {
    klass._frozenEncryptionValidatorInstalled = true;
    klass.validate((record: any) => {
      if (!getEncryptionContext().frozenEncryption) return;
      // Delegate to the Rails-mirrored static so both code paths share one impl.
      EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(record);
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
      // Mock-model arm: real Base subclasses no longer hold wrapped defs (the
      // eager view is retired) — their declarations hit the pending arm above.
      if (encryptedTypeOf(defs.get(attr)?.type)) return true;
    }
    current = Object.getPrototypeOf(current);
  }
  return false;
}

// ─── Instance-level encryption API ──────────────────────────────────────────
//
// The bodies live in `encryption/encryptable-record.ts`, the file matching
// Rails' `encryption/encryptable_record.rb`; base.ts reaches them through the
// hook registry below.

/** Mirrors: ActiveRecord::Encryption.key_length */
export function keyLength(): number {
  return AesGcmCipher.keyLength;
}

/** Mirrors: ActiveRecord::Encryption.iv_length */
export function ivLength(): number {
  return AesGcmCipher.ivLength;
}

/** Mirrors: ActiveRecord::Encryption.eager_load! */
export function eagerLoadBang(): void {
  // No-op in TS — all encryption classes are statically imported.
}

// ─── Delegation to Configurable (included into Encryption in Rails) ──────────

/** Mirrors: ActiveRecord::Encryption.config (mattr_reader from Configurable) */
export function config(): Config {
  return Configurable.config;
}

/**
 * Mirrors Rails' `mattr_accessor :encrypted_attribute_declaration_listeners`
 * (configurable.rb:11), exposed on Encryption via the Configurable concern.
 * Called with no argument it reads; called with a value it writes.
 */
export function encryptedAttributeDeclarationListeners(
  ...value: [] | [Array<(klass: any, name: string) => void> | undefined]
): Array<(klass: any, name: string) => void> | undefined {
  // Use arguments length (not `value !== undefined`) so the writer can clear
  // the accessor back to undefined — mirroring Rails' nil-able mattr_accessor.
  if (value.length > 0) {
    Configurable.encryptedAttributeDeclarationListeners = value[0];
  }
  return Configurable.encryptedAttributeDeclarationListeners;
}

/** Mirrors: ActiveRecord::Encryption.configure */
export function configure(options: Parameters<typeof Configurable.configure>[0]): void {
  Configurable.configure(options);
}

/** Mirrors: ActiveRecord::Encryption.on_encrypted_attribute_declared */
export function onEncryptedAttributeDeclared(
  callback: (klass: any, name: string) => void,
): () => void {
  return Configurable.onEncryptedAttributeDeclared(callback);
}

/** @internal */
export function encryptedAttributeWasDeclared(klass: any, name: string): void {
  Configurable.encryptedAttributeWasDeclared(klass, name);
}

// ─── Delegation to Contexts (included into Encryption in Rails) ──────────────

/** Mirrors: ActiveRecord::Encryption.with_encryption_context */
export function withEncryptionContext<T>(properties: EncryptionContext, fn: () => T): T {
  return Contexts.withEncryptionContext(properties, fn);
}

/** Mirrors: ActiveRecord::Encryption.without_encryption */
export function withoutEncryption<T>(fn: () => T): T {
  return Contexts.withoutEncryption(fn);
}

/** Mirrors: ActiveRecord::Encryption.protecting_encrypted_data */
export function protectingEncryptedData<T>(fn: () => T): T {
  return Contexts.protectingEncryptedData(fn);
}

/** Mirrors: ActiveRecord::Encryption.context */
export function context(): EncryptionContext {
  return Contexts.context;
}

/** Mirrors: ActiveRecord::Encryption.current_custom_context */
export function currentCustomContext(): EncryptionContext | null {
  return Contexts.currentCustomContext;
}

/**
 * Mirrors Rails' `mattr_accessor :default_context` (contexts.rb:17), exposed
 * on Encryption via the Contexts concern. Called with no argument it reads;
 * called with a value it writes.
 */
export function defaultContext(value?: EncryptionContext): EncryptionContext {
  if (value !== undefined) {
    setDefaultContext(value);
  }
  return getDefaultContext();
}

/** @internal */
export function resetDefaultContext(): void {
  Contexts.resetDefaultContext();
}

// Register real implementations into the hook registry so base.ts picks them
// up without statically importing this module (which would drag zlib/crypto
// into browser bundles via the configurable → config → zlib chain).
registerEncryptionHooks({
  encrypts,
  applyPendingEncryptions,
  requireOriginalColumnsAfterReflection: (klass: any, columnNames: string[]) =>
    EncryptableRecord.requireOriginalColumnsAfterReflection(klass, columnNames),
  buildScheme,
  encryptedAttribute: (record: any, name: string) =>
    EncryptableRecord.encryptedAttribute(record, name),
  ciphertextFor: (record: any, name: string) => EncryptableRecord.ciphertextFor(record, name),
  encrypt: (record: any) => EncryptableRecord.encrypt(record),
  decrypt: (record: any) => EncryptableRecord.decrypt(record),
});
