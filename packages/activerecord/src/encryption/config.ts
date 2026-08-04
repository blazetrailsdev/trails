/**
 * Encryption configuration.
 *
 * Mirrors: ActiveRecord::Encryption::Config
 */

import { presence } from "@blazetrails/activesupport";

import { Configuration } from "./errors.js";
import type { SchemeOptions } from "./scheme.js";

export class Config {
  private _primaryKey?: string | string[];
  private _deterministicKey?: string;
  private _keyDerivationSalt?: string;
  storeKeyReferences: boolean = false;
  supportUnencryptedData: boolean = false;
  encryptFixtures: boolean = false;
  validateColumnSize: boolean = true;
  addToFilterParameters: boolean = true;
  excludeFromFilterParameters: string[] = [];
  previousSchemes: SchemeOptions[] = [];
  supportSha1ForNonDeterministicEncryption: boolean = false;
  extendQueries: boolean = false;
  hashDigestClass: string = "SHA1";
  keyProviderClass?: string;
  compressor: Compressor = defaultCompressor;
  forcedEncodingForDeterministicEncryption: string = "UTF-8";

  constructor() {
    this.setDefaults();
  }

  get excludedFromFilterParameters(): string[] {
    return this.excludeFromFilterParameters;
  }

  set previous(schemes: SchemeOptions[]) {
    for (const props of schemes) {
      this.addPreviousScheme(props);
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
    this.excludeFromFilterParameters = [];
    this.previousSchemes = [];
    this.forcedEncodingForDeterministicEncryption = "UTF-8";
    this.hashDigestClass = "SHA1";
    this.compressor = defaultCompressor;
    this.extendQueries = false;
  }

  /** @internal */
  private addPreviousScheme(properties: SchemeOptions): void {
    this.previousSchemes.push(properties);
  }
}

export interface Compressor {
  deflate(data: string): Buffer | Uint8Array;
  inflate(data: Buffer | Uint8Array): string;
}

import { deflateSync, inflateSync } from "zlib";

export const defaultCompressor: Compressor = {
  deflate(data: string): Buffer {
    return deflateSync(Buffer.from(data, "utf-8"));
  },
  inflate(data: Buffer | Uint8Array): string {
    return inflateSync(data).toString("utf-8");
  },
};
