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
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Configurable } from "./configurable.js";
import type { Message } from "./message.js";

export class EnvelopeEncryptionKeyProvider {
  private _primaryKeyProviderOverride?: KeyProvider;
  private _activePrimaryKey?: Key;

  constructor(primaryKeyProvider?: KeyProvider) {
    this._primaryKeyProviderOverride = primaryKeyProvider;
  }

  encryptionKey(): Key {
    const randomSecret = this.generateRandomSecret();
    const key = new Key(randomSecret);
    key.publicTags = { encrypted_data_key: this.encryptDataKey(randomSecret) };
    return key;
  }

  decryptionKeys(message: Message): Key[] {
    const secret = this.decryptDataKey(message);
    return secret ? [new Key(secret)] : [];
  }

  get activePrimaryKey(): Key {
    this._activePrimaryKey ??= this.primaryKeyProvider().encryptionKey();
    return this._activePrimaryKey;
  }

  generateRandomEncryptionKey(): string {
    return this.generateRandomSecret();
  }

  /** @internal */
  private encryptDataKey(randomSecret: string): string {
    return new Encryptor({ compress: false }).encrypt(randomSecret, {
      key: this.activePrimaryKey.secret,
    });
  }

  /** @internal */
  private decryptDataKey(encryptedMessage: Message): string | null {
    const encryptedDataKey = encryptedMessage.headers.get("encrypted_data_key") as
      | string
      | undefined;
    if (!encryptedDataKey) return null;
    const kp = this.primaryKeyProvider();
    const keys = kp.decryptionKeys(encryptedMessage)?.map((k) => k.secret);
    if (!keys || keys.length === 0) return null;
    return new Encryptor({ compress: false }).decrypt(encryptedDataKey, { keyProvider: kp });
  }

  /** @internal */
  private primaryKeyProvider(): KeyProvider {
    if (this._primaryKeyProviderOverride) return this._primaryKeyProviderOverride;
    return new DerivedSecretKeyProvider(Configurable.config.get("primaryKey") as string);
  }

  /** @internal */
  private generateRandomSecret(): string {
    return getCrypto().randomBytes(32).toString("base64");
  }
}
