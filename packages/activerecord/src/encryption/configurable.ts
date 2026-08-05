import { Config } from "./config.js";
// Rails reads `ActiveRecord::Encryption.context` / `.reset_default_context`
// (configurable.rb:17, 33, 36) — the `Contexts` module those come from. This
// module imports their implementations from `context.js` rather than `Contexts`
// itself: `Contexts` imports `EncryptingOnlyEncryptor` for
// `protecting_encrypted_data` (contexts.rb:57), and that class `extends
// Encryptor`, which imports this module. Going through `Contexts` would put
// that `extends` inside an ESM cycle, where a graph entered at `encryptor.ts`
// evaluates the subclass while `Encryptor` is still in TDZ.
import { getEncryptionContext, resetDefaultContext, Context } from "./context.js";
import { Cipher } from "./cipher.js";
import type { EncryptorLike } from "./encryptor.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import type { SchemeOptions } from "./scheme.js";

type DeclarationListener = (klass: any, name: string) => void;

let _sharedConfig: Config | null = null;
// Mirrors Rails' `mattr_accessor :encrypted_attribute_declaration_listeners`
// (no default → nil). Lazily allocated in onEncryptedAttributeDeclared.
let _listeners: DeclarationListener[] | undefined;

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

  /**
   * Rails' `Context::PROPERTIES.each { |name| delegate name, to: :context }`
   * (configurable.rb:16-19), written out one reader per property.
   *
   * The loop cannot survive: it runs while this module's body does, and on a
   * graph entered at `context.ts` — `index.ts` re-exports `context.js` before
   * `configurable.js`, and `context.ts` imports this module for
   * `build_default_key_provider` — `Context` is then still in TDZ, which is a
   * `ReferenceError`, not a stale read. A hoisted function is what could be
   * read there, and that function was the shim this story deletes. The set is
   * instead held to `Context::PROPERTIES` at compile time, by
   * {@link DelegatedProperty} below.
   */
  static get keyProvider(): unknown {
    return getEncryptionContext().keyProvider;
  }

  static get keyGenerator(): unknown {
    return getEncryptionContext().keyGenerator;
  }

  static get cipher(): Cipher {
    return getEncryptionContext().cipher as Cipher;
  }

  static get messageSerializer(): MessageSerializerLike | undefined {
    return getEncryptionContext().messageSerializer;
  }

  static get encryptor(): EncryptorLike | undefined {
    return getEncryptionContext().encryptor as EncryptorLike | undefined;
  }

  static get frozenEncryption(): boolean {
    return getEncryptionContext().frozenEncryption;
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

    resetDefaultContext();

    for (const [key, value] of Object.entries(properties)) {
      if (key === "primaryKey" || key === "deterministicKey" || key === "keyDerivationSalt") {
        continue;
      }
      if (value === undefined) continue;
      if (!(Context.PROPERTIES as readonly string[]).includes(key)) continue;
      (getEncryptionContext() as unknown as Record<string, unknown>)[key] = value;
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

/** @internal One `Context::PROPERTIES` name (context.rb:13). */
type DelegatedProperty = (typeof Context.PROPERTIES)[number];

/**
 * @internal Type-only, erased at emit: `Pick` fails to compile the moment a
 * `Context::PROPERTIES` name has no reader on `Configurable`, which is the
 * drift the deleted `PROPERTIES.each` loop prevented by construction.
 */
declare const _contextPropertiesAreDelegated: Pick<typeof Configurable, DelegatedProperty>;
