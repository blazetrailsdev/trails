/**
 * Envelope encryption key provider — generates random data keys,
 * encrypted by the primary key.
 *
 * Mirrors: ActiveRecord::Encryption::EnvelopeEncryptionKeyProvider
 */

import * as crypto from "crypto";
import { Key } from "./key.js";
import { Encryptor } from "./encryptor.js";
import { KeyProvider } from "./key-provider.js";
import type { Message } from "./message.js";

export class EnvelopeEncryptionKeyProvider {
  private _primaryKeyProvider: KeyProvider;
  private _encryptor: Encryptor;

  constructor(primaryKeyProvider: KeyProvider) {
    this._primaryKeyProvider = primaryKeyProvider;
    this._encryptor = new Encryptor({ compress: false });
  }

  encryptionKey(): Key {
    const randomSecret = this.generateRandomEncryptionKey();
    const key = new Key(randomSecret);
    const primaryKey = this._primaryKeyProvider.encryptionKey();
    const encryptedSecret = this._encryptor.encrypt(randomSecret, {
      key: primaryKey.secret,
    });
    key.publicTags = { encrypted_data_key: encryptedSecret };
    return key;
  }

  decryptionKeys(message: Message): Key[] {
    const encryptedDataKey = message.headers.get("encrypted_data_key") as string;
    if (!encryptedDataKey) {
      return [];
    }
    const secret = this._encryptor.decrypt(encryptedDataKey, {
      keyProvider: this._primaryKeyProvider,
    });
    return [new Key(secret)];
  }

  generateRandomEncryptionKey(): string {
    return crypto.randomBytes(32).toString("base64");
  }
}
