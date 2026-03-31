import { Config } from "./config.js";

let _sharedConfig: Config | null = null;
const _listeners: Array<(klass: any, name: string) => void> = [];

/**
 * Configuration API for ActiveRecord::Encryption. Manages the shared
 * Config instance and encrypted attribute declaration callbacks.
 *
 * Mirrors: ActiveRecord::Encryption::Configurable
 */
export class Configurable {
  static get config(): Config {
    if (!_sharedConfig) {
      _sharedConfig = new Config();
    }
    return _sharedConfig;
  }

  static configure(options: {
    primaryKey?: string | string[];
    deterministicKey?: string;
    keyDerivationSalt?: string;
    [key: string]: unknown;
  }): void {
    const config = this.config;
    if (options.primaryKey !== undefined) config.primaryKey = options.primaryKey;
    if (options.deterministicKey !== undefined) config.deterministicKey = options.deterministicKey;
    if (options.keyDerivationSalt !== undefined)
      config.keyDerivationSalt = options.keyDerivationSalt;

    for (const [key, value] of Object.entries(options)) {
      if (key === "primaryKey" || key === "deterministicKey" || key === "keyDerivationSalt") {
        continue;
      }
      if (key in config) {
        (config as any)[key] = value;
      }
    }
  }

  static onEncryptedAttributeDeclared(callback: (klass: any, name: string) => void): void {
    _listeners.push(callback);
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    for (const listener of _listeners) {
      listener(klass, name);
    }
  }
}
