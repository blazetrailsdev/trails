/**
 * Encrypting-only encryptor — encrypts but returns raw data on decrypt.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptingOnlyEncryptor
 */

import { Encryptor } from "./encryptor.js";
import type { KeyProviderLike } from "./encryptor.js";

export class EncryptingOnlyEncryptor {
  private _encryptor: Encryptor;

  constructor() {
    this._encryptor = new Encryptor();
  }

  encrypt(
    clearText: string,
    options?: { keyProvider?: KeyProviderLike; key?: string; deterministic?: boolean },
  ): string {
    return this._encryptor.encrypt(clearText, options);
  }

  decrypt(encryptedText: string): string {
    return encryptedText;
  }
}
