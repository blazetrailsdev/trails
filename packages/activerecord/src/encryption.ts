import { type SchemeOptions } from "./encryption/scheme.js";
export { Cipher } from "./encryption/cipher.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
import type { Context } from "./encryption/context.js";
import type { Config } from "./encryption/config.js";

export type EncryptsOptions = SchemeOptions;

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
