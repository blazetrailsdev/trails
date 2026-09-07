import { deflateSync, inflateSync } from "zlib";

import { presence } from "@blazetrails/activesupport";
import { OpenSSL, type DigestClass } from "@blazetrails/ruby-compat";

import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { KeyGenerator } from "./key-generator.js";
import { Scheme, type SchemeOptions } from "./scheme.js";

/** @noRailsEquivalent PERMANENT */
export interface Compressor {
  deflate(data: string): Buffer | Uint8Array;
  inflate(data: Buffer | Uint8Array): string;
}

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
  previousSchemes: Scheme[] = [];
  extendQueries: boolean = false;
  hashDigestClass: DigestClass = OpenSSL.Digest.SHA1;
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

  setSupportSha1ForNonDeterministicEncryption(value: boolean): void {
    if (value && this.hasPrimaryKey()) {
      const sha1KeyGenerator = new KeyGenerator({ hashDigestClass: OpenSSL.Digest.SHA1 });
      const sha1KeyProvider = new DerivedSecretKeyProvider(this.primaryKey, {
        keyGenerator: sha1KeyGenerator,
      });
      this.addPreviousScheme({ keyProvider: sha1KeyProvider });
    }
  }

  hasKeyDerivationSalt(): string | undefined {
    return presence(this._keyDerivationSalt);
  }

  hasPrimaryKey(): string | string[] | undefined {
    return presence(this._primaryKey);
  }

  hasDeterministicKey(): string | undefined {
    return presence(this._deterministicKey);
  }

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
    this.hashDigestClass = OpenSSL.Digest.SHA1;
    this.compressor = Zlib;
    this.extendQueries = false;
  }

  private addPreviousScheme(properties: SchemeOptions): void {
    this.previousSchemes.push(new Scheme(properties));
  }
}
