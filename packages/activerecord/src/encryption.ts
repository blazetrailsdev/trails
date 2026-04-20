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

import { EncryptedAttributeType } from "./encryption/encrypted-attribute-type.js";
import { Scheme, type SchemeOptions } from "./encryption/scheme.js";
import type { EncryptorLike } from "./encryption/encryptor.js";

/**
 * The simple encryptor surface `Base.encrypts({ encryptor })` accepts.
 * If the encryptor implements `encrypted(text)` it will be consulted
 * directly; otherwise the shim probes by calling `decrypt(text)` and
 * treats a non-throwing decrypt as encrypted (see
 * `LegacyEncryptorShim.encrypted`). Custom encryptors whose `decrypt`
 * accepts plaintext without throwing should also implement
 * `encrypted(text)` to avoid misclassification.
 */
export interface Encryptor {
  encrypt(value: string): string;
  decrypt(ciphertext: string): string;
  encrypted?(text: string): boolean;
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
  encrypted(text: string): boolean {
    return typeof text === "string" && text.startsWith(ENCRYPTED_PREFIX);
  },
};

/**
 * Adapts the simple `{ encrypt, decrypt }` pair accepted by `Base.encrypts`
 * to the wider `EncryptorLike` surface that `Scheme.encryptor` expects.
 * Options are intentionally ignored — the legacy path has no key provider
 * or deterministic mode.
 *
 * `encrypted()` is what `supportUnencryptedData` consults to distinguish
 * ciphertext from plaintext on read. Returning the wrong answer is
 * critical in both directions: false positive and the shim decrypts
 * plaintext (may corrupt it); false negative and it skips decryption
 * for real ciphertext (returns garbage to the caller). Resolution order:
 *
 *   1. Delegate to `inner.encrypted(text)` if the user supplied one —
 *      this is the only reliable answer for custom encryptors.
 *   2. Otherwise, try `inner.decrypt(text)` and treat a throw as
 *      "not encrypted". Matches Rails' own
 *      `ActiveRecord::Encryption::Encryptor#encrypted?`, which does
 *      `serializer.load(encrypted_text); true; rescue; false`.
 *
 * Two caveats with the fallback path:
 *
 * - A custom encryptor whose `decrypt` is permissive (doesn't throw
 *   on plaintext) MUST supply `encrypted()` to avoid misclassification.
 * - When `supportUnencryptedData` is enabled, the scheme consults
 *   `encrypted()` before decrypting, so the fallback path runs
 *   `decrypt` once for the probe and once for real — roughly 2x the
 *   CPU. Rails avoids this by probing with `serializer.load` (cheap
 *   parse, no cipher), but the simple `{ encrypt, decrypt }` surface
 *   has no equivalent cheap probe. Supplying `encrypted()` eliminates
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

  encrypted(text: string): boolean {
    if (this.inner.encrypted) return this.inner.encrypted(text);
    try {
      this.inner.decrypt(text);
      return true;
    } catch {
      return false;
    }
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
  const { encryptor, ...schemeOptions } = options;

  if (encryptor) {
    return new Scheme({ ...schemeOptions, encryptor: new LegacyEncryptorShim(encryptor) });
  }

  const hasSchemeOptions =
    schemeOptions.key !== undefined ||
    schemeOptions.keyProvider !== undefined ||
    schemeOptions.deterministic !== undefined ||
    schemeOptions.downcase !== undefined ||
    schemeOptions.ignoreCase !== undefined ||
    schemeOptions.previousSchemes !== undefined ||
    schemeOptions.compress !== undefined ||
    schemeOptions.compressor !== undefined;

  if (hasSchemeOptions) {
    return new Scheme(schemeOptions);
  }

  // No scheme configuration and no explicit encryptor — fall back to
  // the repo's default AR_ENC:base64 encryptor so `this.encrypts("name")`
  // works in contexts that haven't set up keys/config.
  return new Scheme({ encryptor: new LegacyEncryptorShim(defaultEncryptor) });
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
    if (def.type instanceof EncryptedAttributeType) continue;
    klass._attributeDefinitions.set(name, {
      ...def,
      type: new EncryptedAttributeType({ scheme, castType: def.type }),
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
