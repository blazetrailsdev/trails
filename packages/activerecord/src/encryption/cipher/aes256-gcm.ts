/**
 * AES-256-GCM cipher.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher::Aes256Gcm
 */

import { getCrypto } from "@blazetrails/activesupport";
import { ConfigError, DecryptionError, EncryptedContentIntegrity } from "../errors.js";
import { Message } from "../message.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** A header/payload value that carries raw bytes — a Buffer (fresh) or string (deserialized). */
function isBytes(value: unknown): value is string | Buffer {
  return typeof value === "string" || Buffer.isBuffer(value);
}

/**
 * Coerce a raw-bytes header/payload value to a Buffer under one interpretation:
 * `latin1` = MRI single-base64 (value already IS the raw bytes); `base64` = the
 * legacy double-base64 fallback (the single decode left a base64 string to decode
 * once more — a Buffer at this point holds those base64 ASCII bytes).
 */
function toBytes(value: string | Buffer, enc: "latin1" | "base64"): Buffer {
  if (Buffer.isBuffer(value)) {
    return enc === "latin1" ? value : Buffer.from(value.toString("latin1"), "base64");
  }
  return Buffer.from(value, enc);
}

export class Aes256Gcm {
  static readonly CIPHER_TYPE = "aes-256-gcm";
  static keyLength = KEY_LENGTH;
  static ivLength = IV_LENGTH;

  // Declared for TypeScript type-checking only; defined as non-enumerable
  // in the constructor so it doesn't appear in JSON.stringify / object spreads.
  declare readonly secret: string;
  readonly deterministic: boolean;

  constructor(secret: string, options?: { deterministic?: boolean }) {
    Object.defineProperty(this, "secret", {
      value: secret,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    this.deterministic = options?.deterministic ?? false;
  }

  // Mirrors Rails' inspect override — never expose the secret in debug output.
  // Symbol.for("nodejs.util.inspect.custom") is the stable public symbol
  // used by Node's util.inspect without importing "util" directly.
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Cipher {}`;
  }

  toJSON(): Record<string, unknown> {
    return { deterministic: this.deterministic };
  }

  encrypt(clearText: string | Buffer, options?: { deterministic?: boolean }): Message {
    this._validateKeyLength(this.secret);
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);
    const inputBuf = Buffer.isBuffer(clearText) ? clearText : Buffer.from(clearText, "utf-8");
    const iv = this.generateIv(keyBuf, inputBuf, options?.deterministic ?? this.deterministic);
    const cipher = getCrypto().createCipheriv(Aes256Gcm.CIPHER_TYPE, keyBuf, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      Buffer.from(cipher.update(inputBuf)),
      Buffer.from(cipher.final()),
    ]);
    if (!cipher.getAuthTag) {
      throw new ConfigError("Crypto adapter does not support GCM auth tags (getAuthTag)");
    }
    const authTag = Buffer.from(cipher.getAuthTag());

    // Store raw bytes as Buffers, like MRI keeps binary Strings on the Message;
    // the serializer then does a single base64 hop, byte-identical to Rails. (The
    // old trails format base64-encoded here too — see decrypt() for back-compat.)
    const message = new Message(encrypted);
    message.addHeaders({ iv, at: authTag });
    return message;
  }

  /**
   * Decrypt a Message and return the raw bytes.
   *
   * **Breaking change from pre-PR-C behaviour**: previously accepted
   * `(payload, keys, iv, authTag)` separately; now accepts a `Message` object
   * to match Rails' `def decrypt(encrypted_message)`.
   *
   * `Encryptor` handles this automatically; only direct `Cipher` users are affected.
   */
  decrypt(message: Message): Buffer {
    const iv = message.headers.get("iv");
    const authTag = message.headers.get("at");
    // Mirrors Rails: nil iv/auth_tag raises EncryptedContentIntegrity (not Decryption),
    // so it propagates out of the per-key retry loop rather than being swallowed.
    // Also guard against malformed header value types from deserialized messages.
    if (!isBytes(iv) || !isBytes(authTag)) throw new EncryptedContentIntegrity();
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);

    // Pick the storage format from the IV, not by trying both auth-tag lengths.
    // The MRI single-base64 format keeps the IV as raw bytes (12 = IV_LENGTH); the
    // legacy double-base64 format stores it as base64 ASCII (16 chars), which never
    // equals 12. Choosing per-message — rather than evaluating the auth-tag length
    // against whichever interpretation happens to yield 16 bytes — keeps Rails'
    // integrity contract: a tag that is truncated under the format actually used
    // raises EncryptedContentIntegrity even if it coincidentally base64-decodes to
    // 16 bytes under the other interpretation (auth-tag forgery defence).
    const enc = toBytes(iv, "latin1").length === IV_LENGTH ? "latin1" : "base64";

    // Mirrors Rails: OpenSSL bindings don't raise on truncated auth tags, so we
    // check the length explicitly. EncryptedContentIntegrity propagates out of the
    // per-key retry loop immediately (unlike Decryption, which is retried).
    const authTagBuf = toBytes(authTag, enc);
    if (authTagBuf.length !== AUTH_TAG_LENGTH) throw new EncryptedContentIntegrity();

    try {
      const decipher = getCrypto().createDecipheriv(
        Aes256Gcm.CIPHER_TYPE,
        keyBuf,
        toBytes(iv, enc),
        {
          authTagLength: AUTH_TAG_LENGTH,
        },
      );
      if (!decipher.setAuthTag) {
        throw new ConfigError("Crypto adapter does not support GCM auth tags (setAuthTag)");
      }
      decipher.setAuthTag(authTagBuf);
      return Buffer.concat([
        Buffer.from(decipher.update(toBytes(message.payload, enc))),
        Buffer.from(decipher.final()),
      ]);
    } catch (e) {
      if (e instanceof ConfigError) throw e;
      // Wrong key or corrupted ciphertext — a decryption failure, retried per-key.
      throw new DecryptionError("The provided key could not decrypt the data");
    }
  }

  private _validateKeyLength(key: string): void {
    const keyBuf = Buffer.from(key, "base64");
    if (keyBuf.length < KEY_LENGTH) {
      throw new ConfigError(
        `The provided key has length ${keyBuf.length} but must be at least ${KEY_LENGTH} bytes`,
      );
    }
  }

  /** @internal */
  private generateIv(keyBuf: Buffer, inputBuf: Buffer, deterministic: boolean): Buffer {
    if (deterministic) {
      return this.generateDeterministicIv(keyBuf, inputBuf);
    }
    return getCrypto().randomBytes(IV_LENGTH);
  }

  /** @internal */
  private generateDeterministicIv(keyBuf: Buffer, clearText: Buffer): Buffer {
    return getCrypto()
      .createHmac("sha256", keyBuf)
      .update(clearText)
      .digest()
      .subarray(0, IV_LENGTH);
  }
}
