import { mattrAccessor, mattrReader } from "@blazetrails/activesupport";
import { Config } from "./config.js";
import { Encryption } from "../namespaces.js";
import { Context } from "./context.js";
import { Contexts } from "./contexts.js";
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
    return Contexts.context.keyProvider;
  }

  static get keyGenerator(): unknown {
    return Contexts.context.keyGenerator;
  }

  static get cipher(): Cipher {
    return Contexts.context.cipher as Cipher;
  }

  static get messageSerializer(): MessageSerializerLike | undefined {
    return Contexts.context.messageSerializer;
  }

  static get encryptor(): EncryptorLike | undefined {
    return Contexts.context.encryptor as EncryptorLike | undefined;
  }

  static get frozenEncryption(): boolean {
    return Contexts.context.frozenEncryption;
  }

  static configure(options: {
    primaryKey?: string | string[];
    deterministicKey?: string;
    keyDerivationSalt?: string;
    previous?: SchemeOptions[];
    [key: string]: unknown;
  }): void {
    const config = this.config;
    config.primaryKey = options.primaryKey;
    config.deterministicKey = options.deterministicKey;
    config.keyDerivationSalt = options.keyDerivationSalt;

    const properties: Record<string, unknown> = { ...options };
    properties.supportSha1ForNonDeterministicEncryption ??= true;

    for (const [key, value] of Object.entries(properties)) {
      if (key === "primaryKey" || key === "deterministicKey" || key === "keyDerivationSalt") {
        continue;
      }
      if (value === undefined) continue;
      const writer = `set${key[0].toUpperCase()}${key.slice(1)}`;
      if (typeof (config as unknown as Record<string, unknown>)[writer] === "function") {
        (config as unknown as Record<string, (v: unknown) => void>)[writer](value);
        continue;
      }
      if (key in config) {
        (config as any)[key] = value;
      }
    }

    Contexts.resetDefaultContext();

    for (const [key, value] of Object.entries(properties)) {
      if (key === "primaryKey" || key === "deterministicKey" || key === "keyDerivationSalt") {
        continue;
      }
      if (value === undefined) continue;
      if (!(Context.PROPERTIES as readonly string[]).includes(key)) continue;
      (Contexts.context as unknown as Record<string, unknown>)[key] = value;
    }
  }

  /** @missingRailsCall new — PERMANENT */
  static onEncryptedAttributeDeclared(callback: (klass: any, name: string) => void): () => void {
    const listeners = (this.encryptedAttributeDeclarationListeners ??= []);
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    const listeners = this.encryptedAttributeDeclarationListeners;
    if (!listeners) return;
    for (const listener of [...listeners]) {
      listener(klass, name);
    }
  }
}

Encryption.Configurable = Configurable;

/** @internal */
type DelegatedProperty = (typeof Context.PROPERTIES)[number];

/** @internal */
declare const _contextPropertiesAreDelegated: Pick<typeof Configurable, DelegatedProperty>;
