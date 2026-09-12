import { registerEncryptionHooks } from "./encryption-hooks.js";
import { Base } from "./base.js";
import { type SchemeOptions } from "./encryption/scheme.js";
import type { EncryptorOptionLike } from "./encryption/encryptor.js";
export { Cipher } from "./encryption/cipher.js";
import {
  EncryptableRecord,
  ciphertextFor,
  decrypt,
  encrypt,
  encryptedAttribute,
  encrypts,
  hasEncryptedAttributes,
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

export interface EncryptsOptions extends Omit<SchemeOptions, "encryptor"> {
  encryptor?: Encryptor;
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

Base.validate((record: any) => EncryptableRecord.cantModifyEncryptedAttributesWhenFrozen(record), {
  if: (record: any) => hasEncryptedAttributes.call(record) && Contexts.context.frozenEncryption,
});

registerEncryptionHooks({
  encrypts: (klass: any, ...args: unknown[]) => encrypts.call(klass, ...args),
  requireOriginalColumnsAfterReflection: (klass: any, columnNames: string[]) =>
    EncryptableRecord.requireOriginalColumnsAfterReflection(klass, columnNames),
  encryptedAttribute: (record: any, name: string) => encryptedAttribute.call(record, name),
  ciphertextFor: (record: any, name: string) => ciphertextFor.call(record, name),
  encrypt: (record: any) => encrypt.call(record),
  decrypt: (record: any) => decrypt.call(record),
});
