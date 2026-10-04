import { Key } from "./key.js";
import { KeyProvider } from "./key-provider.js";
import type { KeyGenerator } from "./key-generator.js";
import { DerivedSecretKeyProvider } from "./derived-secret-key-provider.js";
import { Encryption } from "../encryption.js";
import type { Message } from "./message.js";

export class EnvelopeEncryptionKeyProvider {
  private _primaryKeyProvider?: KeyProvider;
  private _activePrimaryKey?: Key;

  encryptionKey(): Key {
    const randomSecret = this.generateRandomSecret();
    const key = new Key(randomSecret);
    key.publicTags.encryptedDataKey = this.encryptDataKey(randomSecret);
    if (Encryption.config.storeKeyReferences) {
      key.publicTags.encryptedDataKeyId = this.activePrimaryKey.id;
    }
    return key;
  }

  decryptionKeys(encryptedMessage: Message): Key[] {
    const secret = this.decryptDataKey(encryptedMessage);
    return secret ? [new Key(secret)] : [];
  }

  get activePrimaryKey(): Key {
    this._activePrimaryKey ??= this.primaryKeyProvider().encryptionKey();
    return this._activePrimaryKey;
  }

  /** @internal */
  private encryptDataKey(randomSecret: string): Message {
    return Encryption.cipher.encrypt(randomSecret, { key: this.activePrimaryKey.secret });
  }

  /** @internal */
  private decryptDataKey(encryptedMessage: Message): string | undefined {
    const encryptedDataKey = encryptedMessage.headers.encryptedDataKey as Message;
    const key = this.primaryKeyProvider()
      .decryptionKeys(encryptedMessage)
      ?.map((k) => k.secret);
    if (key) return Encryption.cipher.decrypt(encryptedDataKey, { key }).toString();
  }

  /** @internal */
  private primaryKeyProvider(): KeyProvider {
    this._primaryKeyProvider ??= new DerivedSecretKeyProvider(
      Encryption.config.primaryKey as string,
    );
    return this._primaryKeyProvider;
  }

  /** @internal */
  private generateRandomSecret(): string {
    return (Encryption.keyGenerator as KeyGenerator).generateRandomKey();
  }
}

Encryption.EnvelopeEncryptionKeyProvider = EnvelopeEncryptionKeyProvider;
