import { MessageSerializer, type MessageSerializerLike } from "./message-serializer.js";
import { Cipher } from "./cipher.js";
import { Configurable } from "./configurable-slot.js";
import { Encryptor } from "./encryptor.js";
import { KeyGenerator } from "./key-generator.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";

export class Context {
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

  /** @internal */
  private buildDefaultKeyProvider(): unknown {
    return new DerivedSecretKeyProvider(Configurable.config.primaryKey);
  }
}
