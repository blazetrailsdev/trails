/**
 * Public-facing cipher API that wraps Aes256Gcm with multi-key rotation
 * and deterministic-mode support.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher (encryption/cipher.rb)
 */

import { Aes256Gcm as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { DecryptionError } from "./errors.js";
import { Message } from "./message.js";

export class Cipher {
  encrypt(clearText: string | Buffer, options: { key: string; deterministic?: boolean }): Message {
    return this.cipherFor(options.key, options.deterministic ?? false).encrypt(clearText, options);
  }

  decrypt(
    encryptedMessage: Message,
    options: { key: string | string[]; [k: string]: unknown },
  ): Buffer {
    const keys = Array.isArray(options.key) ? options.key : [options.key];
    return this.tryToDecryptWithEach(encryptedMessage, { keys });
  }

  keyLength(): number {
    return AesGcmCipher.keyLength;
  }

  ivLength(): number {
    return AesGcmCipher.ivLength;
  }

  /** @internal */
  private tryToDecryptWithEach(encryptedMessage: Message, { keys }: { keys: string[] }): Buffer {
    if (keys.length === 0) throw new DecryptionError("No decryption keys provided");
    let lastError: unknown;
    for (let i = 0; i < keys.length; i++) {
      try {
        return this.cipherFor(keys[i]).decrypt(encryptedMessage);
      } catch (e) {
        if (!(e instanceof DecryptionError)) throw e; // integrity/config errors propagate immediately
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
