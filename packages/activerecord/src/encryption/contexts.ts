/**
 * Encryption contexts — thread-local-like context stack.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

export interface EncryptionContext {
  encryptionDisabled?: boolean;
  protectedMode?: boolean;
  keyProvider?: unknown;
  [key: string]: unknown;
}

const contextStack: EncryptionContext[] = [{}];

function currentContext(): EncryptionContext {
  return contextStack[contextStack.length - 1];
}

export function withEncryptionContext(overrides: EncryptionContext, fn: () => void): void {
  const previous = currentContext();
  contextStack.push({ ...previous, ...overrides });
  try {
    fn();
  } finally {
    contextStack.pop();
  }
}

export function withoutEncryption(fn: () => void): void {
  withEncryptionContext({ encryptionDisabled: true }, fn);
}

export function protectingEncryptedData(fn: () => void): void {
  withEncryptionContext({ protectedMode: true }, fn);
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
