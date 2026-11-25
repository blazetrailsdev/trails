import { rbDeclareIvar } from "@blazetrails/ruby-compat";
import { MessageSerializer, type MessageSerializerLike } from "./message-serializer.js";
import { Cipher } from "./cipher.js";
import { Encryption } from "../namespaces.js";
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

  declare private _keyProvider?: unknown;
  declare private _keyGenerator?: unknown;
  declare private _cipher?: unknown;
  declare private _messageSerializer?: MessageSerializerLike;
  declare private _encryptor?: unknown;
  declare private _frozenEncryption: boolean;

  get keyGenerator(): unknown {
    return this._keyGenerator;
  }

  set keyGenerator(value: unknown) {
    this._keyGenerator = value;
  }

  get cipher(): unknown {
    return this._cipher;
  }

  set cipher(value: unknown) {
    this._cipher = value;
  }

  get messageSerializer(): MessageSerializerLike | undefined {
    return this._messageSerializer;
  }

  set messageSerializer(value: MessageSerializerLike | undefined) {
    this._messageSerializer = value;
  }

  get encryptor(): unknown {
    return this._encryptor;
  }

  set encryptor(value: unknown) {
    this._encryptor = value;
  }

  get frozenEncryption(): boolean {
    return this._frozenEncryption;
  }

  set frozenEncryption(value: boolean) {
    this._frozenEncryption = value;
  }

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
    return new DerivedSecretKeyProvider(Encryption.config.primaryKey);
  }
}

rbDeclareIvar(Context, "@key_provider", "_keyProvider");
rbDeclareIvar(Context, "@key_generator", "_keyGenerator");
rbDeclareIvar(Context, "@cipher", "_cipher");
rbDeclareIvar(Context, "@message_serializer", "_messageSerializer");
rbDeclareIvar(Context, "@encryptor", "_encryptor");
rbDeclareIvar(Context, "@frozen_encryption", "_frozenEncryption");

Encryption.Context = Context;
