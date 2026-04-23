/**
 * Encryption scheme — binds configuration to an encryptor instance.
 *
 * Mirrors: ActiveRecord::Encryption::Scheme
 */

import { Encryptor, type EncryptorLike } from "./encryptor.js";
import { ConfigError } from "./errors.js";
import type { Compressor } from "./config.js";
import { Configurable } from "./configurable.js";
import { withEncryptionContext } from "./context.js";

export interface SchemeOptions {
  keyProvider?: unknown;
  key?: string;
  deterministic?: boolean;
  supportUnencryptedData?: boolean;
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
  private _encryptor: EncryptorLike;
  // Original options as-passed — used by _toOptions() / merge() to distinguish
  // "not set" (undefined) from "explicitly set to false", mirroring Rails'
  // @context_properties + nil-defaulted ivars + to_h.compact pattern.
  private _opts: SchemeOptions;

  constructor(options: SchemeOptions = {}) {
    this._opts = { ...options };
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
    return this._encryptor;
  }

  isSupportUnencryptedData(): boolean {
    return this._opts.supportUnencryptedData ?? Configurable.config.supportUnencryptedData;
  }

  isFixed(): boolean {
    return this.deterministic;
  }

  merge(other: Scheme): Scheme {
    return new Scheme({ ...this._toOptions(), ...other._toOptions() });
  }

  withContext<T>(fn: () => T): T {
    const { encryptor, compress, compressor } = this._opts;
    if (encryptor !== undefined || compress === false || compressor !== undefined) {
      return withEncryptionContext({ encryptor: this._encryptor }, fn);
    }
    return fn();
  }

  isCompatibleWith(other: Scheme): boolean {
    return this.deterministic === other.deterministic;
  }

  private _toOptions(): SchemeOptions {
    const o = this._opts;
    const opts: SchemeOptions = {};
    if (o.keyProvider !== undefined) opts.keyProvider = o.keyProvider;
    if (o.key !== undefined) opts.key = o.key;
    if (o.deterministic !== undefined) opts.deterministic = o.deterministic;
    if (o.downcase !== undefined) opts.downcase = o.downcase;
    if (o.ignoreCase !== undefined) opts.ignoreCase = o.ignoreCase;
    if (o.previousSchemes !== undefined) opts.previousSchemes = o.previousSchemes;
    if (o.supportUnencryptedData !== undefined)
      opts.supportUnencryptedData = o.supportUnencryptedData;
    if (o.compress !== undefined) opts.compress = o.compress;
    if (o.compressor !== undefined) opts.compressor = o.compressor;
    if (o.encryptor !== undefined) opts.encryptor = o.encryptor;
    return opts;
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
