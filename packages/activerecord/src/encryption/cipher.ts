/**
 * Public-facing cipher API that wraps Aes256Gcm with multi-key rotation
 * and deterministic-mode support. The internal encryption subsystem
 * (Encryptor, EncryptedAttributeType) uses Aes256Gcm directly.
 *
 * Mirrors: ActiveRecord::Encryption::Cipher (encryption/cipher.rb)
 */

import { Aes256Gcm as AesGcmCipher } from "./cipher/aes256-gcm.js";
import { ConfigError, DecryptionError } from "./errors.js";
import { Message } from "./message.js";

export class Cipher {
  encrypt(clearText: string, key: string, options?: { deterministic?: boolean }): string {
    const message = this.cipherFor(key, options?.deterministic ?? false).encrypt(
      clearText,
      options,
    );
    return JSON.stringify({
      p: message.payload,
      iv: message.headers.get("iv"),
      at: message.headers.get("at"),
    });
  }

  decrypt(encryptedText: string, key: string | string[]): string {
    return this.tryToDecryptWithEach(encryptedText, { keys: Array.isArray(key) ? key : [key] });
  }

  keyLength(): number {
    return AesGcmCipher.keyLength;
  }

  ivLength(): number {
    return AesGcmCipher.ivLength;
  }

  /** @internal */
  private tryToDecryptWithEach(encryptedText: string, { keys }: { keys: string[] }): string {
    let data: { p: string; iv: string; at: string };
    try {
      const parsed = JSON.parse(encryptedText) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as any).p !== "string" ||
        typeof (parsed as any).iv !== "string" ||
        typeof (parsed as any).at !== "string"
      ) {
        throw new DecryptionError("Invalid encrypted text format");
      }
      data = parsed as { p: string; iv: string; at: string };
    } catch (e) {
      if (e instanceof DecryptionError) throw e;
      throw new DecryptionError("Invalid encrypted text format");
    }
    if (keys.length === 0) throw new DecryptionError("No decryption keys provided");
    let lastError: unknown;
    for (const key of keys) {
      try {
        const msg = new Message(data.p);
        msg.addHeaders({ iv: data.iv, at: data.at });
        const buf = this.cipherFor(key).decrypt(msg);
        return buf.toString("utf-8");
      } catch (e) {
        if (e instanceof ConfigError) throw e;
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
