import { mattrAccessor, mattrReader } from "@blazetrails/activesupport";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Config } from "./config.js";
import { Encryption } from "../namespaces.js";
import { Context } from "./context.js";
import { Cipher } from "./cipher.js";
import type { EncryptorLike } from "./encryptor.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import type { SchemeOptions } from "./scheme.js";

type DeclarationListener = (klass: any, name: string) => void;

export class Configurable {
  declare static config: Config;
  declare static encryptedAttributeDeclarationListeners: DeclarationListener[] | undefined;
  declare config: Config;
  declare encryptedAttributeDeclarationListeners: DeclarationListener[] | undefined;

  static {
    mattrReader.call(this, "config", { default: new Config() });
    mattrAccessor.call(this, "encryptedAttributeDeclarationListeners");
  }

  static get keyProvider(): unknown {
    return Encryption.context.keyProvider;
  }

  static get keyGenerator(): unknown {
    return Encryption.context.keyGenerator;
  }

  static get cipher(): Cipher {
    return Encryption.context.cipher as Cipher;
  }

  static get messageSerializer(): MessageSerializerLike | undefined {
    return Encryption.context.messageSerializer;
  }

  static get encryptor(): EncryptorLike | undefined {
    return Encryption.context.encryptor as EncryptorLike | undefined;
  }

  static get frozenEncryption(): boolean {
    return Encryption.context.frozenEncryption;
  }

  static configure({
    primaryKey,
    deterministicKey,
    keyDerivationSalt,
    ...properties
  }: {
    primaryKey?: string | string[];
    deterministicKey?: string;
    keyDerivationSalt?: string;
    previous?: SchemeOptions[];
    [key: string]: unknown;
  }): void {
    this.config.primaryKey = primaryKey;
    this.config.deterministicKey = deterministicKey;
    this.config.keyDerivationSalt = keyDerivationSalt;

    if (properties.supportSha1ForNonDeterministicEncryption == null) {
      properties.supportSha1ForNonDeterministicEncryption = true;
    }

    for (const [name, value] of Object.entries(properties)) {
      if (rbObjRespondTo(Encryption.config, `${name}=`)) {
        rbFSend(Encryption.config, `${name}=`, value);
      }
    }

    Encryption.resetDefaultContext();

    for (const [name, value] of Object.entries(properties)) {
      if (rbObjRespondTo(Encryption.context, `${name}=`)) {
        rbFSend(Encryption.context, `${name}=`, value);
      }
    }
  }

  static onEncryptedAttributeDeclared(block: DeclarationListener): DeclarationListener[] {
    this.encryptedAttributeDeclarationListeners ||= [];
    this.encryptedAttributeDeclarationListeners.push(block);
    return this.encryptedAttributeDeclarationListeners;
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    this.encryptedAttributeDeclarationListeners?.forEach((block) => {
      block(klass, name);
    });
  }
}

Encryption.Configurable = Configurable;

/** @internal */
type DelegatedProperty = (typeof Context.PROPERTIES)[number];

/** @internal */
declare const _contextPropertiesAreDelegated: Pick<typeof Configurable, DelegatedProperty>;
