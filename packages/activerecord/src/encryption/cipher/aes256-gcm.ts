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

  readonly secret?: string;
  readonly deterministic: boolean;

  constructor(secret?: string, options?: { deterministic?: boolean }) {
    this.secret = secret;
    this.deterministic = options?.deterministic ?? false;
  }

  encrypt(
    data: string,
    key: string,
    options?: { deterministic?: boolean },
  ): { payload: string; iv: string; authTag: string } {
    this._validateKeyLength(key);
    const crypto = getCrypto();
    const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
    let iv: Buffer;
    if (options?.deterministic ?? this.deterministic) {
      iv = Buffer.from(crypto.createHash("sha256").update(data).update(key).digest()).subarray(
        0,
        IV_LENGTH,
      );
    } else {
      iv = Buffer.from(crypto.randomBytes(IV_LENGTH));
    }
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([
      Buffer.from(cipher.update(Buffer.from(data, "utf-8"))),
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

  decrypt(payload: string, keys: string | string[], iv: string, authTag: string): string {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const ivBuf = Buffer.from(iv, "base64");
    const authTagBuf = Buffer.from(authTag, "base64");
    const encryptedBuf = Buffer.from(payload, "base64");

    const crypto = getCrypto();
    for (const key of keyList) {
      try {
        const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
        const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, ivBuf, {
          authTagLength: AUTH_TAG_LENGTH,
        });
        if (!decipher.setAuthTag) {
          throw new ConfigError("Crypto adapter does not support GCM auth tags (setAuthTag)");
        }
        decipher.setAuthTag(authTagBuf);
        const decrypted = Buffer.concat([
          Buffer.from(decipher.update(encryptedBuf)),
          Buffer.from(decipher.final()),
        ]);
        return decrypted.toString("utf-8");
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
