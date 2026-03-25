/**
 * AES-256-GCM cipher.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher::Aes256Gcm
 */

import * as crypto from "crypto";
import { ConfigError, DecryptionError } from "../errors.js";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export class Cipher {
  static keyLength = KEY_LENGTH;
  static ivLength = IV_LENGTH;

  encrypt(
    data: string,
    key: string,
    options?: { deterministic?: boolean },
  ): { payload: string; iv: string; authTag: string } {
    this._validateKeyLength(key);
    const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
    let iv: Buffer;
    if (options?.deterministic) {
      iv = crypto.createHash("sha256").update(data).update(key).digest().subarray(0, IV_LENGTH);
    } else {
      iv = crypto.randomBytes(IV_LENGTH);
    }
    const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([cipher.update(data, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

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

    for (const key of keyList) {
      try {
        const keyBuf = Buffer.from(key, "base64").subarray(0, KEY_LENGTH);
        const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuf, ivBuf, {
          authTagLength: AUTH_TAG_LENGTH,
        });
        decipher.setAuthTag(authTagBuf);
        const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
        return decrypted.toString("utf-8");
      } catch {
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
