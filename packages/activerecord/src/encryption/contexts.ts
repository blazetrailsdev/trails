import {
  withEncryptionContext as _withCtx,
  withoutEncryption as _withoutEnc,
  protectingEncryptedData as _protecting,
  getEncryptionContext,
  getDefaultContext,
  setDefaultContext as _setDefaultContext,
  getCurrentCustomContext,
  resetDefaultContext as _resetDefaultContext,
  type Context,
} from "./context.js";

/**
 * Class-based API for managing encryption contexts. Delegates to the
 * manual-stack context system in context.ts (Promise-aware push/pop).
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */
export class Contexts {
  static get context(): Context {
    return getEncryptionContext();
  }

  static withEncryptionContext<T>(properties: Partial<Context>, fn: () => T): T {
    return _withCtx(properties, fn);
  }

  static withoutEncryption<T>(fn: () => T): T {
    return _withoutEnc(fn);
  }

  static protectingEncryptedData<T>(fn: () => T): T {
    return _protecting(fn);
  }

  static get currentCustomContext(): Context | null {
    return getCurrentCustomContext();
  }

  static get defaultContext(): Context {
    return getDefaultContext();
  }

  static set defaultContext(value: Context) {
    _setDefaultContext(value);
  }

  static resetDefaultContext(): void {
    _resetDefaultContext();
  }
}
