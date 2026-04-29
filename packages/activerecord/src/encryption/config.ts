/**
 * Encryption configuration.
 *
 * Mirrors: ActiveRecord::Encryption::Config
 */

import { NotImplementedError } from "../errors.js";
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

  constructor() {}

  get excludedFromFilterParameters(): string[] {
    return this.excludeFromFilterParameters;
  }

  set previous(schemes: SchemeOptions[]) {
    for (const props of schemes) {
      this.previousSchemes.push(props);
    }
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

/** @internal */
function setDefaults(): never {
  throw new NotImplementedError("ActiveRecord::Encryption::Config#set_defaults is not implemented");
}

/** @internal */
function addPreviousScheme(properties?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::Config#add_previous_scheme is not implemented",
  );
}
