import { Encryptor } from "./encryptor.js";

export class EncryptingOnlyEncryptor extends Encryptor {
  override decrypt(encryptedText: string, _options?: Parameters<Encryptor["decrypt"]>[1]): string {
    return encryptedText;
  }
}
