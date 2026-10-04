import { Encryption } from "../namespaces.js";
import { deflateSync, inflateSync } from "zlib";

import { presence } from "@blazetrails/activesupport";
import {
  OpenSSL,
  rbModAttrReader,
  rbModAttrWriter,
  type DigestClass,
} from "@blazetrails/ruby-compat";

import { Configuration } from "./errors.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { KeyGenerator } from "./key-generator.js";
import { Scheme, type SchemeOptions } from "./scheme.js";

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
  declare storeKeyReferences: boolean;
  declare hashDigestClass: DigestClass;
  declare supportUnencryptedData: boolean;
  declare encryptFixtures: boolean;
  declare validateColumnSize: boolean;
  declare addToFilterParameters: boolean;
  declare excludedFromFilterParameters: string[];
  declare extendQueries: boolean;
  declare previousSchemes: Scheme[];
  declare forcedEncodingForDeterministicEncryption: string;
  declare compressor: Compressor;

  static {
    const attrs = [
      "primaryKey",
      "deterministicKey",
      "storeKeyReferences",
      "keyDerivationSalt",
      "hashDigestClass",
      "supportUnencryptedData",
      "encryptFixtures",
      "validateColumnSize",
      "addToFilterParameters",
      "excludedFromFilterParameters",
      "extendQueries",
      "previousSchemes",
      "forcedEncodingForDeterministicEncryption",
      "compressor",
    ];
    rbModAttrReader(this, ...attrs.filter((id) => !Object.hasOwn(this.prototype, id)));
    rbModAttrWriter(this, ...attrs);
  }

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

Encryption.Config = Config;
