import { Config } from "./config.js";
import { Contexts } from "./contexts.js";

let _sharedConfig: Config | null = null;
const _listeners: Array<(klass: any, name: string) => void> = [];
const _configureHooks: Array<() => void> = [];

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

  // Mirrors Rails' delegation of Context::PROPERTIES to context.
  static get keyProvider(): unknown {
    return Contexts.context.keyProvider;
  }

  static configure(options: {
    primaryKey?: string | string[];
    deterministicKey?: string;
    keyDerivationSalt?: string;
    previous?: Config["previousSchemes"];
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
      if (value === undefined) continue;
      if (key in config) {
        (config as any)[key] = value;
      }
    }

    // Mirror Rails: reset_default_context after setting config so context
    // properties derived from config (e.g. key_provider) are re-evaluated.
    Contexts.resetDefaultContext();
    for (const hook of _configureHooks) hook();
  }

  static onConfigure(hook: () => void): () => void {
    _configureHooks.push(hook);
    return () => {
      const idx = _configureHooks.indexOf(hook);
      if (idx !== -1) _configureHooks.splice(idx, 1);
    };
  }

  static onEncryptedAttributeDeclared(callback: (klass: any, name: string) => void): () => void {
    _listeners.push(callback);
    return () => {
      const idx = _listeners.indexOf(callback);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    for (const listener of [..._listeners]) {
      listener(klass, name);
    }
  }
}
