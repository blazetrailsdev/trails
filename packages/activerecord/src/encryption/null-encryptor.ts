export class NullEncryptor {
  encrypt(cleanText: string, _options?: Record<string, unknown>): string {
    return cleanText;
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
