import {
  withEncryptionContext as _withCtx,
  withoutEncryption as _withoutEnc,
  protectingEncryptedData as _protecting,
  getEncryptionContext,
  getDefaultContext,
  getCurrentCustomContext,
  resetDefaultContext as _resetDefaultContext,
  type EncryptionContext,
} from "./context.js";

/**
 * Class-based API for managing encryption contexts. Delegates to the
 * manual-stack context system in context.ts (Promise-aware push/pop).
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */
export class Contexts {
  static get context(): EncryptionContext {
    return getEncryptionContext();
  }

  static withEncryptionContext<T>(properties: EncryptionContext, fn: () => T): T {
    return _withCtx(properties, fn);
  }

  static withoutEncryption<T>(fn: () => T): T {
    return _withoutEnc(fn);
  }

  static protectingEncryptedData<T>(fn: () => T): T {
    return _protecting(fn);
  }

  static get currentCustomContext(): EncryptionContext | null {
    return getCurrentCustomContext();
  }

  static get defaultContext(): EncryptionContext {
    return getDefaultContext();
  }

  static resetDefaultContext(): void {
    _resetDefaultContext();
  }
}
