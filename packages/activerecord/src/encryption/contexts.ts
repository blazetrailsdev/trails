import { Context } from "./context.js";
import { NullEncryptor } from "./null-encryptor.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";

const customContexts: Context[] = [];

let _defaultContext: Context | undefined;

export class Contexts {
  static get defaultContext(): Context {
    return (_defaultContext ??= new Context());
  }

  static set defaultContext(value: Context) {
    _defaultContext = value;
  }

  static withEncryptionContext<T>(properties: Partial<Context>, fn: () => T): T {
    const frame: Context = Object.assign(
      Object.create(Object.getPrototypeOf(this.defaultContext)),
      this.defaultContext,
    );
    Object.assign(frame, properties);
    customContexts.push(frame);
    let result: T;
    try {
      result = fn();
    } catch (e) {
      customContexts.pop();
      throw e;
    }
    if (result && typeof (result as { then?: unknown }).then === "function") {
      return (result as unknown as Promise<unknown>).then(
        (val) => {
          customContexts.pop();
          return val;
        },
        (err) => {
          customContexts.pop();
          throw err;
        },
      ) as unknown as T;
    }
    customContexts.pop();
    return result;
  }

  static withoutEncryption<T>(fn: () => T): T {
    return this.withEncryptionContext({ encryptor: new NullEncryptor() }, fn);
  }

  static protectingEncryptedData<T>(fn: () => T): T {
    return this.withEncryptionContext(
      { encryptor: new EncryptingOnlyEncryptor(), frozenEncryption: true },
      fn,
    );
  }

  static get context(): Context {
    return this.currentCustomContext ?? this.defaultContext;
  }

  /** @missingRailsCall last — PERMANENT */
  static get currentCustomContext(): Context | null {
    return customContexts.length > 0 ? customContexts[customContexts.length - 1] : null;
  }

  static resetDefaultContext(): void {
    _defaultContext = new Context();
  }
}
