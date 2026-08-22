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
import type { EncryptorOptionLike } from "./encryption/encryptor.js";
import { Aes256Gcm as AesGcmCipher } from "./encryption/cipher/aes256-gcm.js";
export { Cipher } from "./encryption/cipher.js";
import {
  EncryptableRecord,
  ciphertextFor,
  decrypt,
  encrypt,
  encryptAttribute,
  encryptedAttribute,
} from "./encryption/encryptable-record.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
import type { Context } from "./encryption/context.js";
import type { Config } from "./encryption/config.js";

/**
 * The simple encryptor surface `Base.encrypts({ encryptor })` accepts — the
 * same shape `Scheme`'s `encryptor:` option takes, adapted to the full contract
 * by `LegacyEncryptorShim` where that option is read.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-encryption-simple-encryptor-onto-encryptor-like). Rails has one
 * encryptor contract, `Encryption::Encryptor`, which trails ports as a class
 * plus the `EncryptorLike` shape; this alias exists only for older call sites.
 */
export type Encryptor = EncryptorOptionLike;

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

interface PendingEncryption {
  name: string;
  scheme: Scheme;
}

/**
 * Declare one or more attributes as encrypted on a model class.
 *
 * Routes each attribute through the shared `EncryptableRecord.encryptAttribute`
 * (single declaration path, mirroring Rails' single `encrypts`), which builds
 * its scheme with `scheme_for` (encryptable_record.rb:69-76) — the one scheme
 * constructor, as in Rails. A legacy `{ encrypt, decrypt }` encryptor rides the
 * `encryptor:` option and is adapted where `Scheme` reads it.
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

  klass.encryptedAttributes ??= new Set<string>();

  for (const name of names) {
    encryptAttribute.call(klass, name, options);
  }
}

/**
 * Post-declaration / post-reflection bookkeeping for encrypted attributes.
 *
 * The type wrapping itself is NOT done here: `encryptAttribute` pushes the
 * durable PendingDecorator once at declaration time, and every type inspection
 * resolves through `typeForAttribute` (Rails' single lookup surface) — there is
 * no eager `_attributeDefinitions` re-wrap to maintain. What remains is the
 * bookkeeping Rails runs from `validate`: the frozen-encryption validator
 * install. The column-size validation is `load_schema!`'s
 * (encryptable_record.rb:126-130) and runs from that chain instead.
 */
export function applyPendingEncryptions(klass: any): void {
  const pending: PendingEncryption[] | undefined = klass._pendingEncryptions;
  if (!pending || pending.length === 0) return;

  // Register the frozen-encryption validator once per class. Own-property check
  // so subclasses that have already snapped their callback chain don't miss it —
  // if a subclass registered callbacks before the parent installed this
  // validator, `in` would suppress installation even though the subclass lacks it.
  // The validator reads `record.constructor.encryptedAttributes` at call time,
  // so it correctly handles STI subclasses with different encrypted attribute sets.
  if (
    !Object.prototype.hasOwnProperty.call(klass, "_frozenEncryptionValidatorInstalled") &&
    typeof klass.validate === "function"
  ) {
    klass._frozenEncryptionValidatorInstalled = true;
    klass.validate((record: any) => {
      if (!Contexts.context.frozenEncryption) return;
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
    current = Object.getPrototypeOf(current);
  }
  return false;
}

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
export function withEncryptionContext<T>(properties: Partial<Context>, fn: () => T): T {
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
export function context(): Context {
  return Contexts.context;
}

/** Mirrors: ActiveRecord::Encryption.current_custom_context */
export function currentCustomContext(): Context | null {
  return Contexts.currentCustomContext;
}

/**
 * Mirrors Rails' `mattr_accessor :default_context` (contexts.rb:17), exposed
 * on Encryption via the Contexts concern. Called with no argument it reads;
 * called with a value it writes.
 */
export function defaultContext(value?: Context): Context {
  if (value !== undefined) {
    Contexts.defaultContext = value;
  }
  return Contexts.defaultContext;
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
  encryptedAttribute: (record: any, name: string) => encryptedAttribute.call(record, name),
  ciphertextFor: (record: any, name: string) => ciphertextFor.call(record, name),
  encrypt: (record: any) => encrypt.call(record),
  decrypt: (record: any) => decrypt.call(record),
});
