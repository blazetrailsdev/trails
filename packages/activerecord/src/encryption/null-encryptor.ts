/**
 * Null encryptor — passes data through unchanged.
 *
 * Mirrors: ActiveRecord::Encryption::NullEncryptor
 */

export class NullEncryptor {
  encrypt(clearText: string, _options?: Record<string, unknown>): string {
    return clearText;
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
