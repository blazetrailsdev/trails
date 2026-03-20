/**
 * Encrypting-only encryptor — encrypts but returns raw data on decrypt.
 *
 * Mirrors: ActiveRecord::Encryption::EncryptingOnlyEncryptor
 */

import { Encryptor } from "./encryptor.js";

export class EncryptingOnlyEncryptor {
  private _encryptor: Encryptor;

  constructor() {
    this._encryptor = new Encryptor();
  }

  encrypt(clearText: string, options?: Record<string, unknown>): string {
    return this._encryptor.encrypt(clearText, options);
  }

  decrypt(encryptedText: string, _options?: Record<string, unknown>): string {
    return encryptedText;
  }
}
