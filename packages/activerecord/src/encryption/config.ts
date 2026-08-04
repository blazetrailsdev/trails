/**
 * Encryption configuration.
 *
 * Mirrors: ActiveRecord::Encryption::Config
 */

import { presence } from "@blazetrails/activesupport";

import { ConfigError } from "./errors.js";
import type { SchemeOptions } from "./scheme.js";

export class Config {
  primaryKey?: string | string[];
  deterministicKey?: string;
  keyDerivationSalt?: string;
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

  private _requiredKeys: Set<string> = new Set([
    "primaryKey",
    "deterministicKey",
    "keyDerivationSalt",
  ]);

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
   * The stored `keyDerivationSalt`, or `undefined` when it is blank — Rails'
   * `has_key_derivation_salt?` returns `.presence`, not a boolean
   * (encryption/config.rb:35-39).
   */
  hasKeyDerivationSalt(): string | undefined {
    return presence(this.keyDerivationSalt);
  }

  /** Rails `has_primary_key?` (encryption/config.rb:35-39). */
  hasPrimaryKey(): string | string[] | undefined {
    return presence(this.primaryKey);
  }

  /** Rails `has_deterministic_key?` (encryption/config.rb:35-39). */
  hasDeterministicKey(): string | undefined {
    return presence(this.deterministicKey);
  }

  get(key: string): unknown {
    const value = (this as any)[key];
    if (value === undefined && this._requiredKeys.has(key)) {
      throw new ConfigError(
        `Missing encryption key: ${key}. Please set ActiveRecord::Encryption.config.${key}`,
      );
    }
    return value;
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
