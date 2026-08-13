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
  deterministic?: boolean | { fixed?: boolean };
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
  private _fixed?: boolean;
  key?: string;
  // Initialized to `undefined` throughout, as Rails initializes every ivar to
  // `nil`: "not set" has to stay distinguishable from "explicitly false" so
  // that `merge` does not override a value with a default (scheme.rb:15-16).
  deterministic?: boolean | { fixed?: boolean };
  private _supportUnencryptedData?: boolean;
  downcase: boolean;
  ignoreCase: boolean;
  private _previousSchemesParam?: Scheme[];
  previousSchemes: Scheme[];
  private compress: boolean;
  private compressor?: Compressor;
  /** Rails' `@context_properties` — the leftover `**` kwargs (scheme.rb:13). */
  private _contextProperties: Partial<Context>;

  constructor(options: SchemeOptions = {}) {
    this._keyProviderParam = options.keyProvider;
    this.key = options.key;
    this.deterministic = options.deterministic;
    this._supportUnencryptedData = options.supportUnencryptedData;
    this.downcase = options.downcase ?? false;
    this.ignoreCase = options.ignoreCase ?? false;
    this._previousSchemesParam = options.previousSchemes;
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

  isDeterministic(): boolean {
    return this.deterministic != null && this.deterministic !== false;
  }

  get keyProvider(): unknown {
    return (
      this._keyProviderParam ??
      this.keyProviderFromKey() ??
      this.deterministicKeyProvider() ??
      this.defaultKeyProvider()
    );
  }

  isSupportUnencryptedData(): boolean {
    return this._supportUnencryptedData ?? Configurable.config.supportUnencryptedData;
  }

  isFixed(): boolean {
    // by default deterministic encryption is fixed
    return (this._fixed ??=
      this.deterministic != null &&
      this.deterministic !== false &&
      (typeof this.deterministic !== "object" || this.deterministic.fixed !== false));
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
    return this.isDeterministic() === other.isDeterministic();
  }

  /** Mirrors: ActiveRecord::Encryption::Scheme#to_h (scheme.rb:65-68). */
  toH(): SchemeOptions {
    const h: SchemeOptions = {
      keyProvider: this._keyProviderParam,
      deterministic: this.deterministic,
      downcase: this.downcase,
      ignoreCase: this.ignoreCase,
      previousSchemes: this._previousSchemesParam,
      ...(this._contextProperties as Partial<SchemeOptions>),
    };
    for (const key of Object.keys(h) as (keyof SchemeOptions)[]) {
      if (h[key] == null) delete h[key];
    }
    return h;
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
    if (this.isDeterministic()) {
      const deterministicKey = Configurable.config.deterministicKey;
      this._cachedDeterministicKeyProvider ??= new DeterministicKeyProvider(deterministicKey);
      return this._cachedDeterministicKeyProvider;
    }
    return undefined;
  }

  /** @internal */
  private validateConfigBang(): void {
    if (this.ignoreCase && !this.isDeterministic()) {
      throw new Configuration("ignoreCase requires deterministic encryption");
    }
    if (this.downcase && !this.isDeterministic()) {
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
