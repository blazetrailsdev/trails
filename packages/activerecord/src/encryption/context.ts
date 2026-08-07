/**
 * Encryption context — the entities used to perform encryption.
 *
 * Mirrors: ActiveRecord::Encryption::Context
 */

import { MessageSerializer, type MessageSerializerLike } from "./message-serializer.js";
import { Cipher } from "./cipher.js";
import { Configurable } from "./configurable-slot.js";
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
  ] as const;

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
   */
  private buildDefaultKeyProvider(): unknown {
    return new DerivedSecretKeyProvider(Configurable.config.primaryKey);
  }
}
