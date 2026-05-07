/**
 * AES-256-GCM cipher.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher::Aes256Gcm
 */

import { getCrypto } from "@blazetrails/activesupport";
import { ConfigError, DecryptionError } from "../errors.js";
import { Message } from "../message.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

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

    const message = new Message(encrypted.toString("base64"));
    message.addHeaders({
      iv: iv.toString("base64"),
      at: authTag.toString("base64"),
    });
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
    const iv = message.headers.get("iv") as string;
    const authTag = message.headers.get("at") as string;
    if (!iv || !authTag) throw new DecryptionError("Missing IV or auth tag");

    const ivBuf = Buffer.from(iv, "base64");
    const authTagBuf = Buffer.from(authTag, "base64");
    const encryptedBuf = Buffer.from(message.payload, "base64");
    const keyBuf = Buffer.from(this.secret, "base64").subarray(0, KEY_LENGTH);

    try {
      const decipher = getCrypto().createDecipheriv(Aes256Gcm.CIPHER_TYPE, keyBuf, ivBuf, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      if (!decipher.setAuthTag) {
        throw new ConfigError("Crypto adapter does not support GCM auth tags (setAuthTag)");
      }
      decipher.setAuthTag(authTagBuf);
      return Buffer.concat([
        Buffer.from(decipher.update(encryptedBuf)),
        Buffer.from(decipher.final()),
      ]);
    } catch (e) {
      if (e instanceof ConfigError) throw e;
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
