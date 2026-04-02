/**
 * ActiveRecord::Encryption — declares encrypted attributes.
 *
 * Mirrors: ActiveRecord::Encryption
 *
 * In Rails, encrypts() uses decorate_attributes which defers type wrapping
 * via PendingDecorator — the actual wrapping happens when _default_attributes
 * is first resolved. This means encrypts() can be called before or after
 * attribute(), and order doesn't matter.
 *
 * We mirror this with _pendingEncryptions: encrypts() records the request,
 * and applyPendingEncryptions() is called during construction to wrap any
 * attributes that haven't been wrapped yet.
 */

import { EncryptedAttributeType } from "./encrypted-attribute-type.js";

export interface Encryptor {
  encrypt(value: string): string;
  decrypt(ciphertext: string): string;
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
};

interface PendingEncryption {
  name: string;
  encryptor: Encryptor;
}

/**
 * Declare one or more attributes as encrypted on a model class.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptableRecord#encrypts
 *
 * Like Rails' decorate_attributes, this defers the actual type wrapping.
 * Pending encryptions are applied when the attribute definitions are
 * first used (via applyPendingEncryptions).
 */
export function encrypts(klass: any, ...args: Array<string | { encryptor?: Encryptor }>): void {
  let enc: Encryptor = defaultEncryptor;
  const names: string[] = [];

  for (const arg of args) {
    if (typeof arg === "string") {
      names.push(arg);
    } else if (arg && typeof arg === "object" && arg.encryptor) {
      enc = arg.encryptor;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(klass, "_pendingEncryptions")) {
    klass._pendingEncryptions = [...(klass._pendingEncryptions ?? [])];
  }

  for (const name of names) {
    klass._pendingEncryptions.push({ name, encryptor: enc });
  }

  // If definitions are already available, apply immediately
  // (handles the common case where attribute() was called first)
  if (klass._attributeDefinitions?.size > 0) {
    applyPendingEncryptions(klass);
  }
}

/**
 * Apply any pending encryption decorations to the class's attribute definitions.
 *
 * Mirrors: Rails' PendingDecorator.apply_to — wraps the attribute type
 * with EncryptedAttributeType if not already wrapped.
 */
export function applyPendingEncryptions(klass: any): void {
  const pending: PendingEncryption[] | undefined = klass._pendingEncryptions;
  if (!pending || pending.length === 0) return;

  if (!Object.prototype.hasOwnProperty.call(klass, "_attributeDefinitions")) {
    klass._attributeDefinitions = new Map(klass._attributeDefinitions);
  }

  for (const { name, encryptor } of pending) {
    const def = klass._attributeDefinitions.get(name);
    if (!def) continue; // attribute not defined yet — will be applied later
    if (def.type instanceof EncryptedAttributeType) continue; // already wrapped
    klass._attributeDefinitions.set(name, {
      ...def,
      type: new EncryptedAttributeType(def.type, encryptor),
    });
  }
}

/**
 * Check if an attribute is encrypted on a class.
 */
export function isEncryptedAttribute(klass: any, attr: string): boolean {
  // Check pending encryptions first (may not be applied yet)
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
