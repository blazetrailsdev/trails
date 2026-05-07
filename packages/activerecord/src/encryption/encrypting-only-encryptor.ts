/**
 * Encrypting-only encryptor — encrypts but returns raw data on decrypt.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptingOnlyEncryptor
 */

import { Encryptor } from "./encryptor.js";

export class EncryptingOnlyEncryptor extends Encryptor {
  override decrypt(encryptedText: string, _options?: Parameters<Encryptor["decrypt"]>[1]): string {
    return encryptedText;
  }
}
