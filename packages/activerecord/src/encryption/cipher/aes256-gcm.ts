/**
 * AES-256-GCM cipher.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher::Aes256Gcm
 */

import { getCrypto } from "@blazetrails/activesupport";
import { ConfigError, DecryptionError } from "../errors.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class Cipher {
  static keyLength = KEY_LENGTH;
  static ivLength = IV_LENGTH;

  // Declared for TypeScript type-checking only; defined as non-enumerable
  // in the constructor so it doesn't appear in JSON.stringify / object spreads.
  declare readonly secret?: string;
  readonly deterministic: boolean;

  constructor(secret?: string, options?: { deterministic?: boolean }) {
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

  encrypt(
    data: string | Buffer,
    key: string,
    options?: { deterministic?: boolean },
  ): { payload: string; iv: string; authTag: string } {
    this._validateKeyLength(key);
    const crypto = getCrypto();
    const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
    // Accept Buffer (e.g. compressed binary data) or string (UTF-8 text).
    const inputBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf-8");
    let iv: Buffer;
    if (options?.deterministic ?? this.deterministic) {
      iv = crypto.createHmac("sha256", keyBuf).update(inputBuf).digest().subarray(0, IV_LENGTH);
    } else {
      iv = crypto.randomBytes(IV_LENGTH);
    }
    const cipher = getCrypto().createCipheriv("aes-256-gcm", keyBuf, iv, {
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

    return {
      payload: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  /**
   * Decrypt a payload and return the raw bytes.
   *
   * **Breaking change from pre-PR-C behaviour**: previously returned a `string`;
   * now returns `Buffer` to match Rails, which stores raw (possibly binary)
   * bytes in the AES cipher. Callers must decode explicitly:
   *   - plain text: `cipher.decrypt(...).toString("utf-8")`
   *   - compressed: pass the Buffer directly to `compressor.inflate()`
   *
   * `Encryptor` handles this automatically; only direct `Cipher` users are affected.
   */
  decrypt(payload: string, keys: string | string[], iv: string, authTag: string): Buffer {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const ivBuf = Buffer.from(iv, "base64");
    const authTagBuf = Buffer.from(authTag, "base64");
    const encryptedBuf = Buffer.from(payload, "base64");

    for (const key of keyList) {
      try {
        const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
        const decipher = getCrypto().createDecipheriv("aes-256-gcm", keyBuf, ivBuf, {
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
        continue;
      }
    }
    throw new DecryptionError("None of the provided keys could decrypt the data");
  }

  private _validateKeyLength(key: string): void {
    const keyBuf = Buffer.from(key, "base64");
    if (keyBuf.length < KEY_LENGTH) {
      throw new ConfigError(
        `The provided key has length ${keyBuf.length} but must be at least ${KEY_LENGTH} bytes`,
      );
    }
  }
}
