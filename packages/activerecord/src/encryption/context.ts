/**
 * Encryption contexts — context stack for encryption settings.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

/**
 * Holds the encryption configuration for a single context frame:
 * key provider, key generator, cipher, message serializer, encryptor,
 * and whether encryption is frozen (read-only mode).
 *
 * Mirrors: ActiveRecord::Encryption::Context
 */
export class Context {
  private _keyProvider?: unknown;
  keyGenerator?: unknown;
  cipher?: unknown;
  messageSerializer?: unknown;
  encryptor?: unknown;
  frozenEncryption: boolean = false;

  constructor() {}

  get keyProvider(): unknown {
    return this._keyProvider;
  }

  set keyProvider(value: unknown) {
    this._keyProvider = value;
  }
}

export interface EncryptionContext {
  encryptionDisabled?: boolean;
  protectedMode?: boolean;
  keyProvider?: unknown;
  [key: string]: unknown;
}

const contextStack: EncryptionContext[] = [];

function currentContext(): EncryptionContext {
  return contextStack.length > 0 ? contextStack[contextStack.length - 1] : {};
}

export function withEncryptionContext<T>(overrides: EncryptionContext, fn: () => T): T {
  const previous = currentContext();
  contextStack.push({ ...previous, ...overrides });
  let result: T;
  try {
    result = fn();
  } catch (e) {
    contextStack.pop();
    throw e;
  }
  // If fn returned a Promise, defer the pop until it settles
  if (result && typeof (result as any).then === "function") {
    return (result as any).then(
      (val: any) => {
        contextStack.pop();
        return val;
      },
      (err: any) => {
        contextStack.pop();
        throw err;
      },
    ) as unknown as T;
  }
  contextStack.pop();
  return result;
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
