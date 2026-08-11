/**
 * Public-facing cipher API that wraps Aes256Gcm with multi-key rotation
 * and deterministic-mode support.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher (encryption/cipher.rb)
 */

// `Kernel#Array` is a global method in Ruby, so cipher.rb:26 spells it `Array(key)`.
// Aliasing on import keeps that spelling at the call site; this file uses no
// global `Array` member, so the shadow costs nothing.
import { kernelArray as Array } from "@blazetrails/activesupport";

import { Aes256Gcm as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { Decryption } from "./errors.js";
import { Message } from "./message.js";

export class Cipher {
  encrypt(clearText: string | Buffer, options: { key: string; deterministic?: boolean }): Message {
    return this.cipherFor(options.key, options.deterministic ?? false).encrypt(clearText, options);
  }

  decrypt(
    encryptedMessage: Message,
    options: { key: string | string[]; [k: string]: unknown },
  ): Buffer {
    return this.tryToDecryptWithEach(encryptedMessage, { keys: Array(options.key) });
  }

  keyLength(): number {
    return AesGcmCipher.keyLength;
  }

  ivLength(): number {
    return AesGcmCipher.ivLength;
  }

  /** @internal */
  private tryToDecryptWithEach(encryptedMessage: Message, { keys }: { keys: string[] }): Buffer {
    if (keys.length === 0) throw new Decryption("No decryption keys provided");
    let lastError: unknown;
    for (let i = 0; i < keys.length; i++) {
      try {
        return this.cipherFor(keys[i]).decrypt(encryptedMessage);
      } catch (e) {
        if (!(e instanceof Decryption)) throw e; // integrity/config errors propagate immediately
        lastError = e;
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Decryption(msg);
  }

  /** @internal */
  private cipherFor(secret: string, deterministic: boolean = false): AesGcmCipher {
    return new AesGcmCipher(secret, { deterministic });
  }
}
