/**
 * Envelope encryption key provider — generates random data keys,
 * encrypted by the primary key.
 *
 * Mirrors: ActiveRecord::Encryption::EnvelopeEncryptionKeyProvider
 */

import { getCrypto } from "@blazetrails/activesupport";
import { Key } from "./key.js";
import { Encryptor } from "./encryptor.js";
import { KeyProvider } from "./key-provider.js";
import type { Message } from "./message.js";

export class EnvelopeEncryptionKeyProvider {
  private _primaryKeyProvider: KeyProvider;
  private _encryptor: Encryptor;
  private _activePrimaryKey?: Key;

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

  get activePrimaryKey(): Key {
    this._activePrimaryKey ??= this._primaryKeyProvider.encryptionKey();
    return this._activePrimaryKey;
  }

  generateRandomEncryptionKey(): string {
    return getCrypto().randomBytes(32).toString("base64");
  }
}
