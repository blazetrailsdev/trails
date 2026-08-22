/**
 * Encryption contexts — the stack of contexts encryption runs against.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

import { Context } from "./context.js";
import { NullEncryptor } from "./null-encryptor.js";
import { EncryptingOnlyEncryptor } from "./encrypting-only-encryptor.js";

/**
 * Rails' `thread_mattr_accessor :custom_contexts` (contexts.rb:19) — the stack
 * `with_encryption_context` pushes a `default_context.dup` onto.
 */
const customContexts: Context[] = [];

/**
 * Rails' `mattr_accessor :default_context, default: Context.new`
 * (contexts.rb:18). A real Context, not a bare object, because Context is where
 * the default key provider is memoized (context.rb:25-27) — that memo is Rails'
 * only key-provider cache, and `reset_default_context` is its only invalidation.
 *
 * Built on first read rather than at module eval: `set_defaults` constructs a
 * KeyGenerator/Encryptor (context.rb:29-35), and both transitively import this
 * module. Ruby's autoload resolves that at the point of use; ESM would evaluate
 * whichever module was entered first and hit the other's class binding in its
 * TDZ, so the construction has to happen after both module bodies have run.
 */
let _defaultContext: Context | undefined;

/**
 * Rails mixes `Contexts` into `ActiveRecord::Encryption` with
 * `extend ActiveSupport::Concern`, so its `class_methods do ... end` block
 * lands as singleton methods. TS has no `include`, so the same members are
 * statics here.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */
export class Contexts {
  /** Mirrors: ActiveRecord::Encryption::Contexts#default_context (contexts.rb:18) */
  static get defaultContext(): Context {
    return (_defaultContext ??= new Context());
  }

  static set defaultContext(value: Context) {
    _defaultContext = value;
  }

  /**
   * Configures a custom encryption context to use when running the provided
   * block of code. It supports overriding all the properties defined in
   * `Context`. Encryption contexts can be nested.
   *
   * Mirrors: ActiveRecord::Encryption::Contexts#with_encryption_context
   * (contexts.rb:32-42) — every frame is `default_context.dup` + the
   * properties, NOT a copy of the enclosing custom context. So nested contexts
   * reset every unspecified property to the default (e.g. `withoutEncryption`
   * nested inside `protectingEncryptedData` resets `frozenEncryption` to
   * false), rather than inheriting it from the outer frame.
   */
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
    // Ruby's `ensure` runs when the block returns; an async block returns a
    // pending Promise, so the pop defers until it settles.
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

  /**
   * Runs the provided block in an encryption context where encryption is
   * disabled: reading encrypted content returns its ciphertexts, writing
   * encrypted content writes its clear text.
   *
   * Mirrors: ActiveRecord::Encryption::Contexts#without_encryption (contexts.rb:49-51)
   */
  static withoutEncryption<T>(fn: () => T): T {
    return this.withEncryptionContext({ encryptor: new NullEncryptor() }, fn);
  }

  /**
   * Runs the provided block in an encryption context where reading encrypted
   * content returns its ciphertext and writing encrypted content fails.
   *
   * Mirrors: ActiveRecord::Encryption::Contexts#protecting_encrypted_data
   * (contexts.rb:57-59)
   */
  static protectingEncryptedData<T>(fn: () => T): T {
    return this.withEncryptionContext(
      { encryptor: new EncryptingOnlyEncryptor(), frozenEncryption: true },
      fn,
    );
  }

  /**
   * Returns the current context.
   *
   * Mirrors: ActiveRecord::Encryption::Contexts#context (contexts.rb:62-64)
   */
  static get context(): Context {
    return this.currentCustomContext ?? this.defaultContext;
  }

  /**
   * Mirrors: ActiveRecord::Encryption::Contexts#current_custom_context (contexts.rb:66-68)
   *
   * @missingRailsCall last — PERMANENT: `custom_contexts&.last` (contexts.rb:67) on a plain
   *   Array — the faithful port is index access, which emits no call name
   *   (compare.ts's `first`/`last` note).
   */
  static get currentCustomContext(): Context | null {
    return customContexts.length > 0 ? customContexts[customContexts.length - 1] : null;
  }

  /** Mirrors: ActiveRecord::Encryption::Contexts#reset_default_context (contexts.rb:70-72) */
  static resetDefaultContext(): void {
    _defaultContext = new Context();
  }
}
