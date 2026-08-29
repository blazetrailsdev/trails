import { Config } from "./config.js";
import { _setConfigurable } from "./configurable-slot.js";
import { Context } from "./context.js";
import { Contexts } from "./contexts.js";
import { Cipher } from "./cipher.js";
import type { EncryptorLike } from "./encryptor.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import type { SchemeOptions } from "./scheme.js";

type DeclarationListener = (klass: any, name: string) => void;

let _listeners: DeclarationListener[] | undefined;

let _config: Config | undefined;

export class Configurable {
  static get config(): Config {
    return (_config ??= new Config());
  }

  static get encryptedAttributeDeclarationListeners(): DeclarationListener[] | undefined {
    return _listeners;
  }

  static set encryptedAttributeDeclarationListeners(value: DeclarationListener[] | undefined) {
    _listeners = value;
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
    const listeners = (_listeners ??= []);
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    if (!_listeners) return;
    for (const listener of [..._listeners]) {
      listener(klass, name);
    }
  }
}

_setConfigurable(Configurable);

/** @internal */
type DelegatedProperty = (typeof Context.PROPERTIES)[number];

/** @internal */
declare const _contextPropertiesAreDelegated: Pick<typeof Configurable, DelegatedProperty>;
