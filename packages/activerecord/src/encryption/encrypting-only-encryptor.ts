/**
 * Encrypting-only encryptor — encrypts but returns raw data on decrypt.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptingOnlyEncryptor
 */

import { Encryptor } from "./encryptor.js";
import type { KeyProviderLike } from "./encryptor.js";

export class EncryptingOnlyEncryptor extends Encryptor {
  override decrypt(
    encryptedText: string,
    _options?: {
      keyProvider?: KeyProviderLike;
      key?: string;
      cipherOptions?: Record<string, unknown>;
    },
  ): string {
    return encryptedText;
  }
}
