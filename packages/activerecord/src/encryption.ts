import { extend } from "@blazetrails/activesupport";
import { Encryption } from "./namespaces.js";
import { type SchemeOptions } from "./encryption/scheme.js";
export { Cipher } from "./encryption/cipher.js";
import { Configurable } from "./encryption/configurable.js";
import { Contexts } from "./encryption/contexts.js";
import type { Context } from "./encryption/context.js";

export type EncryptsOptions = SchemeOptions;

extend(Encryption, Configurable);
extend(Encryption, Contexts);

export { Encryption };

export function eagerLoadBang(): void {}

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
