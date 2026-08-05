import { Config } from "./config.js";
import { _setConfigurable } from "./configurable-slot.js";
import { Context } from "./context.js";
import { Contexts } from "./contexts.js";
import { Cipher } from "./cipher.js";
import type { EncryptorLike } from "./encryptor.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import type { SchemeOptions } from "./scheme.js";

type DeclarationListener = (klass: any, name: string) => void;

// Mirrors Rails' `mattr_accessor :encrypted_attribute_declaration_listeners`
// (no default → nil). Lazily allocated in onEncryptedAttributeDeclared.
let _listeners: DeclarationListener[] | undefined;

let _config: Config | undefined;

/**
 * Configuration API for ActiveRecord::Encryption. Manages the shared
 * Config instance and encrypted attribute declaration callbacks.
 *
 * Mirrors: ActiveRecord::Encryption::Configurable
 */
export class Configurable {
  /**
   * Mirrors Rails' `mattr_reader :config, default: Config.new`
   * (configurable.rb:9). Built on first read rather than at module eval so the
   * singleton does not depend on where in the import graph this module lands.
   */
  static get config(): Config {
    return (_config ??= new Config());
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

  /**
   * Rails' `Context::PROPERTIES.each { |name| delegate name, to: :context }`
   * (configurable.rb:16-19), written out one reader per property.
   *
   * The loop cannot survive: it runs while this module's body does, and on a
   * graph entered at `context.ts` — which imports this module for
   * `build_default_key_provider` — `Context` is still in TDZ then, a
   * `ReferenceError` rather than a stale read. Only a hoisted function is
   * readable there, and that function was the shim this story deletes. The set
   * is held to `Context::PROPERTIES` at compile time instead, by
   * {@link DelegatedProperty} below.
   */
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

  /**
   * Mirrors `Configurable.configure`
   * (activerecord/lib/active_record/encryption/configurable.rb:20-36).
   *
   * `primary_key:`, `deterministic_key:` and `key_derivation_salt:` are kwargs
   * defaulting to `nil` and assigned unconditionally (configurable.rb:21-23),
   * so a call that omits one *clears* the credential it had rather than keeping
   * it. Callers that want the previous value pass it explicitly.
   *
   * The remaining properties are applied twice, as Rails applies them: once to
   * `config` (configurable.rb:29-31), then again to the freshly-reset default
   * `Context` (configurable.rb:35-37), which is how a `Context`-only property —
   * `encryptor`, `cipher`, `frozenEncryption` — reaches the context at all.
   * The `reset_default_context` between them is also the only key-provider
   * invalidation Rails has: `Context` memoizes its default key provider
   * (context.rb:25-27), so a fresh `Context` is a fresh provider.
   */
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

_setConfigurable(Configurable);

/** @internal One `Context::PROPERTIES` name (context.rb:13). */
type DelegatedProperty = (typeof Context.PROPERTIES)[number];

/**
 * @internal Type-only, erased at emit: `Pick` stops compiling the moment a
 * `Context::PROPERTIES` name has no reader on `Configurable` — the drift the
 * `PROPERTIES.each` loop prevented by construction.
 */
declare const _contextPropertiesAreDelegated: Pick<typeof Configurable, DelegatedProperty>;
