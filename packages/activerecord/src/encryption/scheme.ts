/**
 * Encryption scheme — binds configuration to an encryptor instance.
 *
 * Mirrors: ActiveRecord::Encryption::Scheme
 */

import {
  Encryptor,
  LegacyEncryptorShim,
  type EncryptorLike,
  type EncryptorOptionLike,
} from "./encryptor.js";
import { Configuration } from "./errors.js";
import { type Compressor } from "./config.js";
import { Configurable } from "./configurable-slot.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import type { Context } from "./context.js";
import { isPresent } from "@blazetrails/activesupport";

import { Contexts } from "./contexts.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { DeterministicKeyProvider } from "./deterministic-key-provider.js";

export interface SchemeOptions {
  keyProvider?: unknown;
  key?: string;
  deterministic?: boolean;
  fixed?: boolean;
  supportUnencryptedData?: boolean;
  downcase?: boolean;
  ignoreCase?: boolean;
  previousSchemes?: Scheme[];
  compress?: boolean;
  compressor?: Compressor;
  encryptor?: EncryptorOptionLike;
  messageSerializer?: MessageSerializerLike;
}

/**
 * The `{ encrypt, decrypt }` pair `Base.encrypts`' `encryptor:` option has
 * always accepted needs adapting to the full contract. Rails has no such step
 * and no such call — it lives here, off `initialize`, so the two
 * `Encryptor.new` calls in the constructor stay the two scheme.rb:32-33 makes.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-encryption-simple-encryptor-onto-encryptor-like) — dies with the shim.
 */
function shimUnlessFullEncryptor(encryptor: EncryptorOptionLike): EncryptorLike {
  return typeof encryptor.isEncrypted === "function" && typeof encryptor.isBinary === "function"
    ? (encryptor as EncryptorLike)
    : new LegacyEncryptorShim(encryptor);
}

export class Scheme {
  private _keyProviderParam?: unknown;
  private _cachedKeyProviderFromKey?: DerivedSecretKeyProvider;
  private _cachedDeterministicKeyProvider?: DeterministicKeyProvider;
  key?: string;
  deterministic: boolean;
  downcase: boolean;
  ignoreCase: boolean;
  previousSchemes: Scheme[];
  private compress: boolean;
  private compressor?: Compressor;
  /** Rails' `@context_properties` — the leftover `**` kwargs (scheme.rb:13). */
  private _contextProperties: Partial<Context>;
  // Original options as-passed — used by toH() / merge() to distinguish
  // "not set" (undefined) from "explicitly set to false", mirroring Rails'
  // @context_properties + nil-defaulted ivars + to_h.compact pattern.
  private _opts: SchemeOptions;

  constructor(options: SchemeOptions = {}) {
    this._opts = { ...options };
    this._keyProviderParam = options.keyProvider;
    this.key = options.key;
    this.deterministic = options.deterministic ?? false;
    this.downcase = options.downcase ?? false;
    this.ignoreCase = options.ignoreCase ?? false;
    this.previousSchemes = options.previousSchemes ?? [];

    this._contextProperties = {};
    if (options.encryptor !== undefined) {
      this._contextProperties.encryptor = shimUnlessFullEncryptor(options.encryptor);
    }
    if (options.messageSerializer !== undefined) {
      this._contextProperties.messageSerializer = options.messageSerializer;
    }
    this.compress = options.compress ?? true;
    this.compressor = options.compressor;

    this.validateConfigBang();

    if (!this.compress)
      this._contextProperties.encryptor = new Encryptor({ compress: this.compress });
    if (options.compressor)
      this._contextProperties.encryptor = new Encryptor({ compressor: options.compressor });
  }

  get keyProvider(): unknown {
    // When an explicit encryptor is provided, key providers are irrelevant —
    // the encryptor handles encryption without needing key material from here.
    if (this._opts.encryptor !== undefined) return this._keyProviderParam ?? undefined;
    return (
      this._keyProviderParam ??
      this.keyProviderFromKey() ??
      this.deterministicKeyProvider() ??
      this.defaultKeyProvider()
    );
  }

  isSupportUnencryptedData(): boolean {
    return this._opts.supportUnencryptedData ?? Configurable.config.supportUnencryptedData;
  }

  // fixed: true (default for deterministic) → serialize uses the oldest previous
  // scheme so existing deterministic ciphertexts remain stable across key rotations.
  // fixed: false → serialize always uses the current (newest) scheme.
  isFixed(): boolean {
    return this._opts.fixed ?? this.deterministic;
  }

  merge(other: Scheme): Scheme {
    return new Scheme({ ...this.toH(), ...other.toH() });
  }

  withContext<T>(fn: () => T): T {
    if (isPresent(this._contextProperties)) {
      return Contexts.withEncryptionContext(this._contextProperties, fn);
    }
    return fn();
  }

  isCompatibleWith(other: Scheme): boolean {
    return this.deterministic === other.deterministic;
  }

  /**
   * Mirrors: ActiveRecord::Encryption::Scheme#to_h (scheme.rb:65-68) — the
   * as-passed options plus `@context_properties`, compacted.
   *
   * Carries four keys Rails' `to_h` does not (`key`, `fixed`,
   * `supportUnencryptedData`, `compress`/`compressor`). That is pre-existing
   * (`_toOptions`, which this renames onto the Rails name) and is what `merge`
   * currently relies on to carry them across; narrowing it to Rails' five keys
   * is story `converge-scheme-to-h-key-set`.
   */
  toH(): SchemeOptions {
    const o = this._opts;
    const opts: SchemeOptions = {};
    if (o.keyProvider !== undefined) opts.keyProvider = o.keyProvider;
    if (o.key !== undefined) opts.key = o.key;
    if (o.deterministic !== undefined) opts.deterministic = o.deterministic;
    if (o.fixed !== undefined) opts.fixed = o.fixed;
    if (o.downcase !== undefined) opts.downcase = o.downcase;
    if (o.ignoreCase !== undefined) opts.ignoreCase = o.ignoreCase;
    if (o.previousSchemes !== undefined) opts.previousSchemes = o.previousSchemes;
    if (o.supportUnencryptedData !== undefined)
      opts.supportUnencryptedData = o.supportUnencryptedData;
    if (o.compress !== undefined) opts.compress = o.compress;
    if (o.compressor !== undefined) opts.compressor = o.compressor;
    return { ...opts, ...(this._contextProperties as Partial<SchemeOptions>) };
  }

  /** @internal */
  private keyProviderFromKey(): DerivedSecretKeyProvider | undefined {
    if (this.key != null) {
      this._cachedKeyProviderFromKey ??= new DerivedSecretKeyProvider(this.key);
      return this._cachedKeyProviderFromKey;
    }
    return undefined;
  }

  /** @internal */
  private defaultKeyProvider(): unknown {
    return Configurable.keyProvider;
  }

  /** @internal */
  private deterministicKeyProvider(): DeterministicKeyProvider | undefined {
    if (this.deterministic) {
      const deterministicKey = Configurable.config.deterministicKey;
      this._cachedDeterministicKeyProvider ??= new DeterministicKeyProvider(deterministicKey);
      return this._cachedDeterministicKeyProvider;
    }
    return undefined;
  }

  /** @internal */
  private validateConfigBang(): void {
    if (this.ignoreCase && !this.deterministic) {
      throw new Configuration("ignoreCase requires deterministic encryption");
    }
    if (this.downcase && !this.deterministic) {
      throw new Configuration("downcase requires deterministic encryption");
    }
    if (this._keyProviderParam != null && this.key != null) {
      throw new Configuration("key and keyProvider can't be used simultaneously");
    }
    if (!this.compress && this.compressor !== undefined) {
      throw new Configuration("compressor can't be used with compress: false");
    }
    if (this.compressor !== undefined && this._contextProperties.encryptor !== undefined) {
      throw new Configuration("compressor can't be used with encryptor");
    }
  }
}
