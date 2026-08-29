import { Encryption } from "./errors.js";

export class ReadOnlyNullEncryptor {
  encrypt(_clearText: string, _options?: Record<string, unknown>): never {
    throw new Encryption("The ReadOnlyNullEncryptor does not support encryption");
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
