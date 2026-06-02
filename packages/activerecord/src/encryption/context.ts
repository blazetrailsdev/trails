/**
 * Encryption contexts — context stack for encryption settings.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

import type { MessageSerializerLike } from "./message-serializer.js";
import { NullEncryptor } from "./null-encryptor.js";

// EncryptingOnlyEncryptor extends the full Encryptor, which transitively imports
// Configurable. Importing it eagerly here would create an eval-time cycle
// (context → encrypting-only-encryptor → encryptor → configurable → contexts →
// context). Inject the factory instead — registered by encryptable-record.ts at
// module load, mirroring setGlobalPreviousSchemesFn's approach to the same problem.
let _encryptingOnlyEncryptorFactory: (() => unknown) | undefined;

/** @internal */
export function setEncryptingOnlyEncryptorFactory(factory: () => unknown): void {
  _encryptingOnlyEncryptorFactory = factory;
}

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
  messageSerializer?: MessageSerializerLike;
  encryptor?: unknown;
  frozenEncryption: boolean = false;

  constructor() {
    this.setDefaults();
  }

  get keyProvider(): unknown {
    return (this._keyProvider ??= this.buildDefaultKeyProvider());
  }

  set keyProvider(value: unknown) {
    this._keyProvider = value;
  }

  /** @internal */
  private setDefaults(): void {
    this.frozenEncryption = false;
  }

  /** @internal */
  private buildDefaultKeyProvider(): unknown {
    // Avoid importing Configurable here to prevent a circular dependency:
    // context → configurable → contexts → context. Callers that need the
    // default key provider resolve it via Configurable.keyProvider directly.
    return undefined;
  }
}

export interface EncryptionContext {
  encryptor?: unknown;
  frozenEncryption?: boolean;
  keyProvider?: unknown;
  messageSerializer?: MessageSerializerLike;
  [key: string]: unknown;
}

const contextStack: EncryptionContext[] = [];
let _defaultContext: EncryptionContext = {};

export function getDefaultContext(): EncryptionContext {
  return _defaultContext;
}

export function resetDefaultContext(): void {
  _defaultContext = {};
}

function currentContext(): EncryptionContext {
  return contextStack.length > 0 ? contextStack[contextStack.length - 1] : _defaultContext;
}

export function withEncryptionContext<T>(overrides: EncryptionContext, fn: () => T): T {
  // Mirrors Rails Contexts#with_encryption_context (contexts.rb:32-42): every frame
  // is `default_context.dup` + the overrides — NOT a copy of the enclosing custom
  // context. So nested contexts reset every unspecified property to the default
  // (e.g. without_encryption nested inside protecting_encrypted_data resets
  // frozen_encryption to false), rather than inheriting it from the outer frame.
  contextStack.push({ ...getDefaultContext(), ...overrides });
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
  return withEncryptionContext({ encryptor: new NullEncryptor() }, fn);
}

export function protectingEncryptedData<T>(fn: () => T): T {
  // The EncryptingOnlyEncryptor factory is registered by encryptable-record.ts,
  // which is always loaded before any real protected-mode read/write/query. The
  // NullEncryptor fallback applies only when context.ts is consumed in isolation
  // (no encryption stack wired) — there the encryptor is never exercised, and
  // frozenEncryption alone drives the observable behavior (write validation +
  // encrypt/decrypt raising Configuration).
  const encryptor = _encryptingOnlyEncryptorFactory
    ? _encryptingOnlyEncryptorFactory()
    : new NullEncryptor();
  return withEncryptionContext({ encryptor, frozenEncryption: true }, fn);
}

export function getEncryptionContext(): EncryptionContext {
  return currentContext();
}

export function getCurrentCustomContext(): EncryptionContext | null {
  return contextStack.length > 0 ? contextStack[contextStack.length - 1] : null;
}

// Compatibility shims, reimplemented on the encryptor-swap model. The flag fields
// are gone; these now derive from the context encryptor/frozenEncryption so the
// existing contexts.test.ts assertions stay green. They become truly dead once
// PR 2 rewrites contexts.test.ts as a DB-backed faithful port — removed there.
export function isEncryptionDisabled(): boolean {
  return currentContext().encryptor instanceof NullEncryptor;
}

export function isProtectedMode(): boolean {
  return currentContext().frozenEncryption === true;
}
