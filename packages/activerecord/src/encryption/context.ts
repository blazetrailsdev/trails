/**
 * Encryption contexts — async-safe context stack using AsyncLocalStorage.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

import { AsyncLocalStorage } from "async_hooks";

export interface EncryptionContext {
  encryptionDisabled?: boolean;
  protectedMode?: boolean;
  keyProvider?: unknown;
  [key: string]: unknown;
}

const storage = new AsyncLocalStorage<EncryptionContext>();

function currentContext(): EncryptionContext {
  return storage.getStore() ?? {};
}

export function withEncryptionContext<T>(overrides: EncryptionContext, fn: () => T): T {
  const previous = currentContext();
  return storage.run({ ...previous, ...overrides }, fn);
}

export function withoutEncryption<T>(fn: () => T): T {
  return withEncryptionContext({ encryptionDisabled: true }, fn);
}

export function protectingEncryptedData<T>(fn: () => T): T {
  return withEncryptionContext({ protectedMode: true }, fn);
}

export function getEncryptionContext(): EncryptionContext {
  return currentContext();
}

export function isEncryptionDisabled(): boolean {
  return currentContext().encryptionDisabled === true;
}

export function isProtectedMode(): boolean {
  return currentContext().protectedMode === true;
}
