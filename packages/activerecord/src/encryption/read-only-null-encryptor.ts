/**
 * Read-only null encryptor — can decrypt but not encrypt.
 *
 * Mirrors: ActiveRecord::Encryption::ReadOnlyNullEncryptor
 */

import { EncryptionError } from "./errors.js";

export class ReadOnlyNullEncryptor {
  encrypt(_clearText: string, _options?: Record<string, unknown>): never {
    throw new EncryptionError("The ReadOnlyNullEncryptor does not support encryption");
  }

  decrypt(encryptedText: string, _options?: Record<string, unknown>): string {
    return encryptedText;
  }

  isEncrypted(_text: string): boolean {
    return false;
  }

  isBinary(): boolean {
    return false;
  }
}
