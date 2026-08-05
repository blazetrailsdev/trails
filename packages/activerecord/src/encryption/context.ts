/**
 * Encryption contexts — context stack for encryption settings.
 *
 * Mirrors: ActiveRecord::Encryption::Contexts
 */

import { MessageSerializer, type MessageSerializerLike } from "./message-serializer.js";
import { NullEncryptor } from "./null-encryptor.js";
import { Configurable } from "./configurable.js";
import { Cipher } from "./cipher.js";
import { Encryptor } from "./encryptor.js";
import { KeyGenerator } from "./key-generator.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

/**
 * Holds the encryption configuration for a single context frame:
 * key provider, key generator, cipher, message serializer, encryptor,
 * and whether encryption is frozen (read-only mode).
 *
 * Mirrors: ActiveRecord::Encryption::Context
 */
export class Context {
  /**
   * Rails `Context::PROPERTIES` (context.rb:13), the names `attr_accessor`
   * defines on a Context. `Configurable.configure` tests against it for the
   * `respond_to?("#{name}=")` guard Rails uses (configurable.rb:35-37).
   */
  static readonly PROPERTIES = [
    "keyProvider",
    "keyGenerator",
    "cipher",
    "messageSerializer",
    "encryptor",
    "frozenEncryption",
  ];

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
    this.keyGenerator = new KeyGenerator();
    this.cipher = new Cipher();
    this.encryptor = new Encryptor();
    this.messageSerializer = new MessageSerializer();
  }

  /**
   * @internal Rails `Context#build_default_key_provider` (context.rb:37-39).
   * `Configurable` is imported for this body alone — the import closes a cycle
   * (context → configurable → context) that holds only because neither module
   * reads the other at eval time.
   */
  private buildDefaultKeyProvider(): unknown {
    return new DerivedSecretKeyProvider(Configurable.config.primaryKey);
  }
}

const contextStack: Context[] = [];
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

export function getDefaultContext(): Context {
  return (_defaultContext ??= new Context());
}

/** @internal */
export function setDefaultContext(context: Context): void {
  _defaultContext = context;
}

export function resetDefaultContext(): void {
  _defaultContext = new Context();
}

function currentContext(): Context {
  return contextStack.length > 0 ? contextStack[contextStack.length - 1] : getDefaultContext();
}

export function withEncryptionContext<T>(overrides: Partial<Context>, fn: () => T): T {
  // Mirrors Rails Contexts#with_encryption_context (contexts.rb:32-42): every frame
  // is `default_context.dup` + the overrides — NOT a copy of the enclosing custom
  // context. So nested contexts reset every unspecified property to the default
  // (e.g. without_encryption nested inside protecting_encrypted_data resets
  // frozen_encryption to false), rather than inheriting it from the outer frame.
  const frame: Context = Object.assign(
    Object.create(Object.getPrototypeOf(getDefaultContext())),
    getDefaultContext(),
  );
  Object.assign(frame, overrides);
  contextStack.push(frame);
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

export function getEncryptionContext(): Context {
  return currentContext();
}

export function getCurrentCustomContext(): Context | null {
  return contextStack.length > 0 ? contextStack[contextStack.length - 1] : null;
}
