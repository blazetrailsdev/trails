/**
 * Encryption configuration.
 *
 * Mirrors: ActiveRecord::Encryption::Config
 */

import { deflateSync, inflateSync } from "zlib";

import { presence } from "@blazetrails/activesupport";

import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { KeyGenerator } from "./key-generator.js";
import type { SchemeOptions } from "./scheme.js";

/**
 * The `deflate`/`inflate` pair a compressor answers.
 *
 * @noRailsEquivalent PERMANENT — Ruby duck-types the compressor — "it must respond to
 * +deflate+ and +inflate+" (encryption/encryptor.rb:22-24) — so no Rails file
 * declares this shape or these two members. TypeScript has to write it down
 * for `Config#compressor`, `Encryptor` and `Scheme` to name the same type.
 */
export interface Compressor {
  deflate(data: string): Buffer | Uint8Array;
  inflate(data: Buffer | Uint8Array): string;
}

/**
 * Ruby's `Zlib`, the module `set_defaults` assigns to `compressor`
 * (encryption/config.rb:59). It is a stdlib constant there, so it is not part
 * of this file's surface; here it is the module-local object that answers the
 * same `deflate`/`inflate` pair.
 */
const Zlib: Compressor = {
  deflate(data: string): Buffer {
    return deflateSync(Buffer.from(data, "utf-8"));
  },
  inflate(data: Buffer | Uint8Array): string {
    return inflateSync(data).toString("utf-8");
  },
};

export class Config {
  private _primaryKey?: string | string[];
  private _deterministicKey?: string;
  private _keyDerivationSalt?: string;
  storeKeyReferences: boolean = false;
  supportUnencryptedData: boolean = false;
  encryptFixtures: boolean = false;
  validateColumnSize: boolean = true;
  addToFilterParameters: boolean = true;
  excludedFromFilterParameters: string[] = [];
  previousSchemes: SchemeOptions[] = [];
  extendQueries: boolean = false;
  hashDigestClass: string = "SHA1";
  compressor: Compressor = Zlib;
  forcedEncodingForDeterministicEncryption: string = "UTF-8";

  constructor() {
    this.setDefaults();
  }

  set previous(schemes: SchemeOptions[]) {
    for (const props of schemes) {
      this.addPreviousScheme(props);
    }
  }

  /**
   * Rails `support_sha1_for_non_deterministic_encryption=`
   * (encryption/config.rb:28-33) is a writer with behavior and no reader: a
   * truthy value with a primary key configured installs a previous scheme
   * whose key provider derives from a SHA1 key generator. A TS `set` accessor
   * would do, but the trails idiom for a Ruby `x=` that is not stored state is
   * a `setX` method, and this one takes no reader alongside it.
   */
  setSupportSha1ForNonDeterministicEncryption(value: boolean): void {
    if (value && this.hasPrimaryKey()) {
      const sha1KeyGenerator = new KeyGenerator("SHA1");
      const sha1KeyProvider = new DerivedSecretKeyProvider(this.primaryKey, {
        keyGenerator: sha1KeyGenerator,
      });
      this.addPreviousScheme({ keyProvider: sha1KeyProvider });
    }
  }

  /**
   * The stored credential's `presence` — Rails' `has_key_derivation_salt?`
   * returns a value, not a boolean (encryption/config.rb:35-39).
   */
  hasKeyDerivationSalt(): string | undefined {
    return presence(this._keyDerivationSalt);
  }

  /** Rails `has_primary_key?` (encryption/config.rb:35-39). */
  hasPrimaryKey(): string | string[] | undefined {
    return presence(this._primaryKey);
  }

  /** Rails `has_deterministic_key?` (encryption/config.rb:35-39). */
  hasDeterministicKey(): string | undefined {
    return presence(this._deterministicKey);
  }

  /** Rails `key_derivation_salt` (encryption/config.rb:41-46). */
  get keyDerivationSalt(): string {
    const value = this.hasKeyDerivationSalt();
    if (value === undefined) {
      throw new Configuration(
        "Missing Active Record encryption credential: active_record_encryption.key_derivation_salt",
      );
    }
    return value;
  }

  set keyDerivationSalt(value: string | undefined) {
    this._keyDerivationSalt = value;
  }

  /** Rails `primary_key` (encryption/config.rb:41-46). */
  get primaryKey(): string | string[] {
    const value = this.hasPrimaryKey();
    if (value === undefined) {
      throw new Configuration(
        "Missing Active Record encryption credential: active_record_encryption.primary_key",
      );
    }
    return value;
  }

  set primaryKey(value: string | string[] | undefined) {
    this._primaryKey = value;
  }

  /** Rails `deterministic_key` (encryption/config.rb:41-46). */
  get deterministicKey(): string {
    const value = this.hasDeterministicKey();
    if (value === undefined) {
      throw new Configuration(
        "Missing Active Record encryption credential: active_record_encryption.deterministic_key",
      );
    }
    return value;
  }

  set deterministicKey(value: string | undefined) {
    this._deterministicKey = value;
  }

  /** @internal */
  private setDefaults(): void {
    this.storeKeyReferences = false;
    this.supportUnencryptedData = false;
    this.encryptFixtures = false;
    this.validateColumnSize = true;
    this.addToFilterParameters = true;
    this.excludedFromFilterParameters = [];
    this.previousSchemes = [];
    this.forcedEncodingForDeterministicEncryption = "UTF-8";
    this.hashDigestClass = "SHA1";
    this.compressor = Zlib;
    this.extendQueries = false;
  }

  /** @internal */
  private addPreviousScheme(properties: SchemeOptions): void {
    this.previousSchemes.push(properties);
  }
}
