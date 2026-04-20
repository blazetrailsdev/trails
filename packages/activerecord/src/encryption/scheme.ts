/**
 * Encryption scheme — binds configuration to an encryptor instance.
 *
 * Mirrors: ActiveRecord::Encryption::Scheme
 */

import { Encryptor, type EncryptorLike } from "./encryptor.js";
import { ConfigError } from "./errors.js";
import type { Compressor } from "./config.js";

export interface SchemeOptions {
  keyProvider?: unknown;
  key?: string;
  deterministic?: boolean;
  downcase?: boolean;
  ignoreCase?: boolean;
  previousSchemes?: Scheme[];
  compress?: boolean;
  compressor?: Compressor;
  encryptor?: EncryptorLike;
}

export class Scheme {
  keyProvider?: unknown;
  key?: string;
  deterministic: boolean;
  downcase: boolean;
  ignoreCase: boolean;
  previousSchemes: Scheme[];
  private _encryptor?: EncryptorLike;

  constructor(options: SchemeOptions = {}) {
    this.keyProvider = options.keyProvider;
    this.key = options.key;
    this.deterministic = options.deterministic ?? false;
    this.downcase = options.downcase ?? false;
    this.ignoreCase = options.ignoreCase ?? false;
    this.previousSchemes = options.previousSchemes ?? [];

    if (options.encryptor) {
      this._encryptor = options.encryptor;
    } else {
      this._encryptor = new Encryptor({
        compress: options.compress,
        compressor: options.compressor,
      });
    }

    this._validate();
  }

  get encryptor(): EncryptorLike {
    return this._encryptor!;
  }

  private _validate(): void {
    if (this.ignoreCase && !this.deterministic) {
      throw new ConfigError("ignoreCase requires deterministic encryption");
    }
    if (this.downcase && !this.deterministic) {
      throw new ConfigError("downcase requires deterministic encryption");
    }
  }
}
