/**
 * Main encryptor — encrypts/decrypts using cipher + message serializer.
 *
 * Mirrors: ActiveRecord::Encryption::Encryptor
 */

import { Message } from "./message.js";
import type { Properties } from "./properties.js";
import type { MessageSerializerLike } from "./message-serializer.js";
import { Base, Configuration, Decryption, Encoding, ForbiddenClass } from "./errors.js";
import { type Compressor } from "./config.js";
import { _Configurable } from "./configurable-slot.js";
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

/**
 * The shape `Scheme`'s `encryptor:` option accepts: the full contract above, or
 * the simple `{ encrypt, decrypt }` pair `Base.encrypts` has always taken, whose
 * two optional members `LegacyEncryptorShim` fills in.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-encryption-simple-encryptor-onto-encryptor-like). Rails' `encryptor:`
 * takes one contract, `Encryption::Encryptor`.
 */
export type EncryptorOptionLike = Omit<EncryptorLike, "isEncrypted" | "isBinary"> &
  Partial<Pick<EncryptorLike, "isEncrypted" | "isBinary">>;

/**
 * Adapts a simple `{ encrypt, decrypt }` pair — the surface `Base.encrypts`'
 * `encryptor:` option has always accepted — to the wider `EncryptorLike` the
 * scheme expects. Applied by `Scheme`'s constructor where the `encryptor:`
 * option is read, so there is exactly one scheme constructor
 * (`EncryptableRecord#scheme_for`, encryptable_record.rb:69-76) as in Rails.
 *
 * Both calls forward their options untouched: a duck that declares no second
 * parameter simply ignores it, so wrapping a fuller encryptor is transparent.
 * What the shim adds is the two optional members of the contract:
 *
 * - `isEncrypted()` is what `supportUnencryptedData` consults to distinguish
 *   ciphertext from plaintext on read. Returning the wrong answer is critical
 *   in both directions: a false positive decrypts plaintext (may corrupt it),
 *   a false negative skips decryption for real ciphertext. It delegates when
 *   the inner encryptor supplies one — the only reliable answer — and
 *   otherwise probes with `decrypt`, treating a throw as "not encrypted",
 *   matching Rails' `Encryptor#encrypted?`, which does
 *   `serializer.load(encrypted_text); true; rescue; false`.
 * - `isBinary()` defaults to false.
 *
 * A custom encryptor whose `decrypt` is permissive (doesn't throw on
 * plaintext) MUST supply `isEncrypted()` to avoid misclassification. With
 * `supportUnencryptedData` on, the probe path also runs `decrypt` twice —
 * once for the probe, once for real. Rails avoids that by probing with
 * `serializer.load` (cheap parse, no cipher); the simple pair has no
 * equivalent cheap probe, so supplying `isEncrypted()` is worthwhile in
 * perf-sensitive paths.
 *
 * @noRailsEquivalent CONVERGEABLE (story:
 * converge-encryption-simple-encryptor-onto-encryptor-like). Rails has one
 * encryptor contract and no adapter; this exists only for the older
 * `{ encrypt, decrypt }` call sites.
 */
export class LegacyEncryptorShim implements EncryptorLike {
  constructor(private readonly inner: EncryptorOptionLike) {}

  encrypt(clearText: string, options?: Record<string, unknown>): string {
    return this.inner.encrypt(clearText, options);
  }

  decrypt(encryptedText: string, options?: Record<string, unknown>): string {
    return this.inner.decrypt(encryptedText, options);
  }

  isEncrypted(text: string): boolean {
    if (this.inner.isEncrypted) return this.inner.isEncrypted(text);
    try {
      this.inner.decrypt(text);
      return true;
    } catch {
      return false;
    }
  }

  isBinary(): boolean {
    return this.inner.isBinary?.() ?? false;
  }
}

export interface KeyProviderLike {
  encryptionKey(): { secret: string; publicTags?: Record<string, unknown> | Properties };
  decryptionKeys(
    message: Message,
  ): Array<{ secret: string; publicTags?: Record<string, unknown> | Properties }>;
}

export class Encryptor {
  private _compress: boolean;
  private _compressor: Compressor;

  constructor(options?: { compress?: boolean; compressor?: Compressor }) {
    this._compress = options?.compress ?? true;
    const Configurable = _Configurable!;
    this._compressor = options?.compressor ?? Configurable.config.compressor;
  }

  encrypt(
    clearText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string; deterministic?: boolean },
  ): string {
    if (options?.keyProvider && options.key !== undefined) {
      throw new Configuration("key and keyProvider can't be used simultaneously");
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
    if (!keyProvider) throw new Configuration("No encryption key provided");
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
      throw new Decryption("key and keyProvider can't be used simultaneously");
    }
    if (typeof encryptedText !== "string") {
      throw new Decryption(
        `The encryptor can only decrypt string values (${typeof encryptedText})`,
      );
    }

    const message = this.deserializeMessage(encryptedText);

    // Collect all candidate secrets then delegate key-rotation to Cipher#decrypt,
    // mirroring Rails: cipher.decrypt(message, key: keys.collect(&:secret), **cipher_options)
    let keys: string[];
    if (options?.keyProvider) {
      keys = options.keyProvider.decryptionKeys(message).map((k) => k.secret);
    } else if (options?.key !== undefined) {
      keys = [options.key];
    } else {
      const kp = this.defaultKeyProvider();
      if (!kp) throw new Decryption("No decryption key provided");
      keys = kp.decryptionKeys(message).map((k) => k.secret);
    }
    if (keys.length === 0) throw new Decryption("No decryption key provided");

    let decrypted: Buffer;
    try {
      decrypted = this.cipher().decrypt(message, { ...options?.cipherOptions, key: keys });
    } catch (e) {
      if (e instanceof Base) throw e;
      throw new Decryption(e instanceof Error ? e.message : String(e));
    }

    try {
      return this.uncompressIfNeeded(decrypted, message.headers.get("c") === true);
    } catch (e) {
      if (e instanceof Base) throw e;
      throw new Decryption(e instanceof Error ? e.message : String(e));
    }
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

  /** @internal */
  private cipher() {
    const Configurable = _Configurable!;
    return Configurable.cipher;
  }

  get compressor(): Compressor {
    return this._compressor;
  }

  isCompress(): boolean {
    return this._compress;
  }

  /** @internal */
  private defaultKeyProvider(): KeyProviderLike | undefined {
    const Configurable = _Configurable!;
    return Configurable.keyProvider as KeyProviderLike | undefined;
  }

  /** @internal */
  private validatePayloadType(clearText: unknown): void {
    if (typeof clearText !== "string") {
      const typeName =
        clearText != null && typeof clearText === "object"
          ? (clearText.constructor?.name ?? "object")
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
  private serializer(): MessageSerializerLike {
    const Configurable = _Configurable!;
    return Configurable.messageSerializer as MessageSerializerLike;
  }

  /** @internal */
  private buildEncryptedMessage(
    clearText: string,
    keyProvider: KeyProviderLike,
    cipherOptions?: { deterministic?: boolean },
  ): Message {
    const encKeyObj = keyProvider.encryptionKey();
    const key = encKeyObj.secret;
    if (key == null) throw new Configuration("No encryption key provided");

    const [cipherInput, compressed] = this.compressIfWorthIt(clearText);
    const message = this.cipher().encrypt(cipherInput, { key, ...cipherOptions });
    if (compressed) message.addHeader("c", true);
    if (encKeyObj.publicTags) {
      message.addHeaders(encKeyObj.publicTags);
    }
    return message;
  }

  /** @internal */
  private compressIfWorthIt(clearText: string): [string | Buffer, boolean] {
    if (
      this._compress &&
      Buffer.byteLength(clearText, "utf-8") > THRESHOLD_TO_JUSTIFY_COMPRESSION
    ) {
      return [this.compress(clearText), true];
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
    const Configurable = _Configurable!;
    return Configurable.config.forcedEncodingForDeterministicEncryption;
  }
}
