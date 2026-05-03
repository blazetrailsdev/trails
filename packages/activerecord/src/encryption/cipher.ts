/**
 * Outer Cipher dispatcher — wraps Aes256Gcm and provides the
 * encryption/decryption API used by the rest of the encryption subsystem.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher (cipher.rb)
 */

import { Cipher as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { DecryptionError } from "./errors.js";

export class Cipher {
  static readonly keyLength = AesGcmCipher.keyLength;
  static readonly ivLength = AesGcmCipher.ivLength;

  encrypt(clearText: string, key: string, options?: { deterministic?: boolean }): string {
    const aes = this.cipherFor(key, options?.deterministic ?? false);
    const { payload, iv, authTag } = aes.encrypt(clearText, key, options);
    return JSON.stringify({ p: payload, iv, at: authTag });
  }

  decrypt(encryptedText: string, key: string | string[]): string {
    return this.tryToDecryptWithEach(encryptedText, { keys: Array.isArray(key) ? key : [key] });
  }

  /** @internal */
  private tryToDecryptWithEach(encryptedText: string, { keys }: { keys: string[] }): string {
    let lastError: unknown;
    for (const key of keys) {
      try {
        const aes = this.cipherFor(key);
        const data = JSON.parse(encryptedText) as { p: string; iv: string; at: string };
        const buf = aes.decrypt(data.p, key, data.iv, data.at);
        return buf.toString("utf-8");
      } catch (e) {
        lastError = e;
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new DecryptionError(msg);
  }

  /** @internal */
  private cipherFor(secret: string, deterministic: boolean = false): AesGcmCipher {
    return new AesGcmCipher(secret, { deterministic });
  }
}
