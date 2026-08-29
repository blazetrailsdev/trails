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
  encryptedAttribute,
  encrypts,
} from "./encryption/encryptable-record.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
import type { Context } from "./encryption/context.js";
import type { Config } from "./encryption/config.js";

/** @noRailsEquivalent CONVERGEABLE */
export type Encryptor = EncryptorOptionLike;

export interface EncryptsOptions extends Omit<SchemeOptions, "encryptor"> {
  encryptor?: Encryptor;
}

interface PendingEncryption {
  name: string;
  scheme: Scheme;
}

export function applyPendingEncryptions(klass: any): void {
  const pending: PendingEncryption[] | undefined = klass._pendingEncryptions;
  if (!pending || pending.length === 0) return;

  if (
    !Object.prototype.hasOwnProperty.call(klass, "_frozenEncryptionValidatorInstalled") &&
    typeof klass.validate === "function"
  ) {
    klass._frozenEncryptionValidatorInstalled = true;
    klass.validate((record: any) => {
      if (!Contexts.context.frozenEncryption) return;
      EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(record);
    });
  }
}

export function isEncryptedAttribute(klass: any, attr: string): boolean {
  let current = klass;
  while (current) {
    const pending: PendingEncryption[] | undefined = current._pendingEncryptions;
    if (pending?.some((p) => p.name === attr)) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

export function keyLength(): number {
  return AesGcmCipher.keyLength;
}

export function ivLength(): number {
  return AesGcmCipher.ivLength;
}

export function eagerLoadBang(): void {}

export function config(): Config {
  return Configurable.config;
}

export function encryptedAttributeDeclarationListeners(
  ...value: [] | [Array<(klass: any, name: string) => void> | undefined]
): Array<(klass: any, name: string) => void> | undefined {
  if (value.length > 0) {
    Configurable.encryptedAttributeDeclarationListeners = value[0];
  }
  return Configurable.encryptedAttributeDeclarationListeners;
}

export function configure(options: Parameters<typeof Configurable.configure>[0]): void {
  Configurable.configure(options);
}

export function onEncryptedAttributeDeclared(
  callback: (klass: any, name: string) => void,
): () => void {
  return Configurable.onEncryptedAttributeDeclared(callback);
}

export function encryptedAttributeWasDeclared(klass: any, name: string): void {
  Configurable.encryptedAttributeWasDeclared(klass, name);
}

export function withEncryptionContext<T>(properties: Partial<Context>, fn: () => T): T {
  return Contexts.withEncryptionContext(properties, fn);
}

export function withoutEncryption<T>(fn: () => T): T {
  return Contexts.withoutEncryption(fn);
}

export function protectingEncryptedData<T>(fn: () => T): T {
  return Contexts.protectingEncryptedData(fn);
}

export function context(): Context {
  return Contexts.context;
}

export function currentCustomContext(): Context | null {
  return Contexts.currentCustomContext;
}

export function defaultContext(value?: Context): Context {
  if (value !== undefined) {
    Contexts.defaultContext = value;
  }
  return Contexts.defaultContext;
}

export function resetDefaultContext(): void {
  Contexts.resetDefaultContext();
}

registerEncryptionHooks({
  encrypts: (klass: any, ...args: unknown[]) => encrypts.call(klass, ...args),
  applyPendingEncryptions,
  requireOriginalColumnsAfterReflection: (klass: any, columnNames: string[]) =>
    EncryptableRecord.requireOriginalColumnsAfterReflection(klass, columnNames),
  encryptedAttribute: (record: any, name: string) => encryptedAttribute.call(record, name),
  ciphertextFor: (record: any, name: string) => ciphertextFor.call(record, name),
  encrypt: (record: any) => encrypt.call(record),
  decrypt: (record: any) => decrypt.call(record),
});
