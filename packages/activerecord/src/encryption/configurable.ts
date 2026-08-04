import { Config } from "./config.js";
import { Contexts } from "./contexts.js";
import { Cipher } from "./cipher.js";
import { clearDefaultKeyProviderCache } from "./default-key-provider-cache.js";
import type { EncryptorLike } from "./encryptor.js";
import type { SchemeOptions } from "./scheme.js";

type DeclarationListener = (klass: any, name: string) => void;

let _sharedConfig: Config | null = null;
let _defaultCipher: Cipher | null = null;
// Mirrors Rails' `mattr_accessor :encrypted_attribute_declaration_listeners`
// (no default → nil). Lazily allocated in onEncryptedAttributeDeclared.
let _listeners: DeclarationListener[] | undefined;
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

  // Mirrors Rails' `mattr_accessor :encrypted_attribute_declaration_listeners`
  // (configurable.rb:11). The listeners are invoked when an encrypted
  // attribute is declared; see onEncryptedAttributeDeclared.
  static get encryptedAttributeDeclarationListeners(): DeclarationListener[] | undefined {
    return _listeners;
  }

  static set encryptedAttributeDeclarationListeners(value: DeclarationListener[] | undefined) {
    _listeners = value;
  }

  // Mirrors Rails' delegation of Context::PROPERTIES to context.
  static get keyProvider(): unknown {
    return Contexts.context.keyProvider;
  }

  static get cipher(): Cipher {
    return (Contexts.context.cipher as Cipher | undefined) ?? (_defaultCipher ??= new Cipher());
  }

  static get encryptor(): EncryptorLike | undefined {
    return Contexts.context.encryptor as EncryptorLike | undefined;
  }

  static configure(options: {
    primaryKey?: string | string[];
    deterministicKey?: string;
    keyDerivationSalt?: string;
    previous?: SchemeOptions[];
    [key: string]: unknown;
  }): void {
    const config = this.config;
    if (options.primaryKey !== undefined) config.primaryKey = options.primaryKey;
    if (options.deterministicKey !== undefined) config.deterministicKey = options.deterministicKey;
    if (options.keyDerivationSalt !== undefined)
      config.keyDerivationSalt = options.keyDerivationSalt;

    const properties: Record<string, unknown> = { ...options };
    // Set the default for this property here instead of in +Config#set_defaults+ as this needs
    // to happen *after* the keys have been set.
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

    this._invalidateCaches();
  }

  private static _invalidateCaches(): void {
    // Mirror Rails: reset_default_context after setting config so context
    // properties derived from config (e.g. key_provider) are re-evaluated.
    _defaultCipher = null;
    Contexts.resetDefaultContext();
    for (const hook of [..._configureHooks]) hook();
  }

  static onConfigure(hook: () => void): () => void {
    _configureHooks.push(hook);
    return () => {
      const idx = _configureHooks.indexOf(hook);
      if (idx !== -1) _configureHooks.splice(idx, 1);
    };
  }

  static onEncryptedAttributeDeclared(callback: (klass: any, name: string) => void): () => void {
    // Mirrors Rails' `self.encrypted_attribute_declaration_listeners ||= ...`
    // (configurable.rb:48) — lazily allocate on first registration.
    const listeners = (_listeners ??= []);
    listeners.push(callback);
    return () => {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  static encryptedAttributeWasDeclared(klass: any, name: string): void {
    // Mirrors Rails' `&.each` safe-navigation (configurable.rb:53) — no-op
    // when no listeners have ever been registered (accessor still nil).
    if (!_listeners) return;
    for (const listener of [..._listeners]) {
      listener(klass, name);
    }
  }
}

// Registered here, not in default-key-provider-cache.ts: Config constructs a
// Scheme (config.rb:65-67), so a Configurable import there closes an import
// cycle through config.ts that runs before this class is defined.
Configurable.onConfigure(clearDefaultKeyProviderCache);
