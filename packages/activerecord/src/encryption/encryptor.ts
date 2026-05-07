/**
 * Main encryptor — encrypts/decrypts using cipher + message serializer.
 *
 * Mirrors: ActiveRecord::Encryption::Encryptor
 */

import { Aes256Gcm as Cipher } from "./cipher/aes256-gcm.js";
import { Message } from "./message.js";
import { MessageSerializer } from "./message-serializer.js";
import { Configurable } from "./configurable.js";
import {
  getOrCreateDefaultKeyProvider,
  clearDefaultKeyProviderCache,
} from "./default-key-provider-cache.js";
import { Base, ConfigError, DecryptionError, Encoding, ForbiddenClass } from "./errors.js";
import type { Compressor } from "./config.js";
import { defaultCompressor } from "./config.js";
import { normalizeEncoding, replaceUnencodable } from "./encoding-helpers.js";

// Mirrors: ActiveRecord::Encryption::Encryptor::THRESHOLD_TO_JUSTIFY_COMPRESSION
const THRESHOLD_TO_JUSTIFY_COMPRESSION = 140;

export interface EncryptorOptions {
  compress?: boolean;
  compressor?: Compressor;
}

/**
 * Structural encryptor surface accepted by `Scheme.encryptor`. The
 * concrete `Encryptor` class satisfies this interface. Keeps the
 * scheme decoupled from any one implementation so a compatible
 * subtype (or test double) can be passed in without casting through
 * `never`.
 */
export interface EncryptorLike {
  encrypt(clearText: string, options?: Record<string, unknown>): string;
  decrypt(encryptedText: string, options?: Record<string, unknown>): string;
  isEncrypted(text: string): boolean;
  isBinary(): boolean;
}

export interface KeyProviderLike {
  encryptionKey(): { secret: string; publicTags?: Record<string, unknown> };
  decryptionKeys(message: Message): Array<{ secret: string; publicTags?: Record<string, unknown> }>;
}

export class Encryptor {
  private _compress: boolean;
  private _compressor: Compressor;
  private _serializer = new MessageSerializer();

  constructor(options?: { compress?: boolean; compressor?: Compressor }) {
    this._compress = options?.compress ?? true;
    this._compressor = options?.compressor ?? defaultCompressor;
  }

  encrypt(
    clearText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string; deterministic?: boolean },
  ): string {
    if (options?.keyProvider && options.key !== undefined) {
      throw new ConfigError("key and keyProvider can't be used simultaneously");
    }
    this.validatePayloadType(clearText);
    const text = options?.deterministic ? this.forceEncodingIfNeeded(clearText) : clearText;
    // Resolve key provider: explicit keyProvider > raw key shortcut > default.
    // Raw key is wrapped in a minimal inline provider so buildEncryptedMessage
    // has a uniform interface (mirrors Rails' key_provider keyword arg).
    // Use !== undefined so an empty-string key is treated as explicitly provided
    // and let the cipher reject it rather than silently falling back.
    const keyProvider: KeyProviderLike | undefined =
      options?.keyProvider ??
      (options?.key !== undefined
        ? { encryptionKey: () => ({ secret: options.key! }), decryptionKeys: () => [] }
        : this.defaultKeyProvider());
    if (!keyProvider) throw new ConfigError("No encryption key provided");
    return this.serializeMessage(
      this.buildEncryptedMessage(text, keyProvider, { deterministic: options?.deterministic }),
    );
  }

  decrypt(
    encryptedText: string,
    options?: {
      keyProvider?: KeyProviderLike;
      key?: string;
      // cipher_options is accepted for API symmetry with encrypt() but unused today —
      // deterministic IV is read from message headers rather than cipher_options on decrypt.
      cipherOptions?: Record<string, unknown>;
    },
  ): string {
    if (options?.keyProvider && options.key !== undefined) {
      throw new DecryptionError("key and keyProvider can't be used simultaneously");
    }
    if (typeof encryptedText !== "string") {
      throw new DecryptionError(
        `The encryptor can only decrypt string values (${typeof encryptedText})`,
      );
    }

    const message = this.deserializeMessage(encryptedText);
    const compressed = message.headers.get("c") === true;

    // Precedence mirrors encrypt(): keyProvider > key > default.
    let keys: string[];
    if (options?.keyProvider) {
      keys = options.keyProvider.decryptionKeys(message).map((k) => k.secret);
    } else if (options?.key !== undefined) {
      keys = [options.key];
    } else {
      const kp = this.defaultKeyProvider();
      if (!kp) throw new DecryptionError("No decryption key provided");
      keys = kp.decryptionKeys(message).map((k) => k.secret);
    }

    // Mirrors Rails: try_to_decrypt_with_each rescues only Errors::Decryption (wrong key /
    // auth-tag mismatch) and re-raises on the last key. Non-Decryption errors (e.g.
    // EncryptedContentIntegrity, ConfigError) propagate immediately. Inflate errors are
    // message-level so they are wrapped as DecryptionError and thrown immediately.
    for (const key of keys) {
      let decryptedBuf: Buffer;
      try {
        decryptedBuf = new Cipher(key).decrypt(message);
      } catch (e) {
        if (e instanceof DecryptionError) continue; // wrong key — try next
        throw e; // EncryptedContentIntegrity, ConfigError, etc.
      }
      try {
        return this.uncompressIfNeeded(decryptedBuf, compressed);
      } catch (e) {
        if (e instanceof Base) throw e;
        throw new DecryptionError(e instanceof Error ? e.message : String(e));
      }
    }
    throw new DecryptionError("None of the provided keys could decrypt the data");
  }

  isEncrypted(text: string): boolean {
    try {
      this.deserializeMessage(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return this.serializer().isBinary();
  }

  get compressor(): Compressor {
    return this._compressor;
  }

  isCompress(): boolean {
    return this._compress;
  }

  /** @internal */
  private defaultKeyProvider(): KeyProviderLike | undefined {
    const ctxKp = Configurable.keyProvider as KeyProviderLike | undefined;
    if (ctxKp) return ctxKp;
    const { primaryKey, keyDerivationSalt, hashDigestClass } = Configurable.config;
    if (primaryKey == null) {
      clearDefaultKeyProviderCache();
      return undefined;
    }
    // Module-level cache keyed by (primaryKey, salt, digest); invalidated by
    // the single onConfigure hook registered in default-key-provider-cache.ts.
    return getOrCreateDefaultKeyProvider(primaryKey, keyDerivationSalt, hashDigestClass);
  }

  /** @internal */
  private validatePayloadType(clearText: unknown): void {
    if (typeof clearText !== "string") {
      const typeName =
        clearText != null && typeof clearText === "object"
          ? ((clearText as object).constructor?.name ?? "object")
          : typeof clearText;
      throw new ForbiddenClass(`The encryptor can only encrypt string values (${typeName})`);
    }
  }

  /** @internal */
  private serializeMessage(message: Message): string {
    return this.serializer().dump(message);
  }

  /** @internal */
  private deserializeMessage(encryptedText: string): Message {
    // Mirrors Rails: rescue ArgumentError, TypeError, Errors::ForbiddenClass => Errors::Encoding
    try {
      return this.serializer().load(encryptedText);
    } catch (e) {
      if (e instanceof ForbiddenClass || e instanceof TypeError) throw new Encoding();
      throw e;
    }
  }

  /** @internal */
  private serializer(): MessageSerializer {
    return this._serializer;
  }

  /** @internal */
  private buildEncryptedMessage(
    clearText: string,
    keyProvider: KeyProviderLike,
    cipherOptions?: { deterministic?: boolean },
  ): Message {
    const encKeyObj = keyProvider.encryptionKey();
    const key = encKeyObj.secret;
    if (key == null) throw new ConfigError("No encryption key provided");

    const [cipherInput, compressed] = this.compressIfWorthIt(clearText);
    const message = new Cipher(key, cipherOptions).encrypt(cipherInput);
    if (compressed) message.addHeader("c", true);
    if (encKeyObj.publicTags) {
      for (const [k, v] of Object.entries(encKeyObj.publicTags)) {
        message.addHeader(k, v);
      }
    }
    return message;
  }

  /** @internal */
  private compressIfWorthIt(clearText: string): [string | Buffer, boolean] {
    if (
      this._compress &&
      Buffer.byteLength(clearText, "utf-8") > THRESHOLD_TO_JUSTIFY_COMPRESSION
    ) {
      const compressed = this.compress(clearText);
      // Extra guard: keep uncompressed if deflate doesn't shrink the data (e.g. already-compressed
      // or high-entropy input). Rails trusts that >140-byte strings are worth compressing. Decrypt
      // reads the `c` header so the asymmetry is interop-safe.
      if (compressed.length < Buffer.byteLength(clearText, "utf-8")) {
        return [compressed, true];
      }
    }
    return [clearText, false];
  }

  /** @internal */
  private compress(data: string): Buffer {
    const result = this._compressor.deflate(data);
    // TS Buffer has no encoding tag; Rails calls force_encoding(data.encoding) here.
    // This is a no-op for the utf-8 round-trip that the cipher/serializer use today.
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  }

  /** @internal */
  private uncompressIfNeeded(data: Buffer, compressed: boolean): string {
    if (compressed) {
      return this.uncompress(data);
    }
    return data.toString("utf-8");
  }

  /** @internal */
  private uncompress(data: Buffer | Uint8Array): string {
    // TS Buffer has no encoding tag; Rails calls force_encoding(data.encoding) here.
    // Callers decode the result as utf-8 consistently so no encoding is lost in practice.
    return this._compressor.inflate(data);
  }

  /** @internal */
  private forceEncodingIfNeeded(value: string): string {
    const enc = this.forcedEncodingForDeterministicEncryption();
    if (!enc) return value;
    const normalized = normalizeEncoding(enc);
    if (!normalized || normalized === "utf8") return value;
    return replaceUnencodable(value, normalized === "ascii" ? 0x7f : 0xff);
  }

  /** @internal */
  private forcedEncodingForDeterministicEncryption(): string {
    return Configurable.config.forcedEncodingForDeterministicEncryption;
  }
}
