/**
 * Key provider — manages encryption/decryption keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyProvider
 */

import { Key } from "./key.js";
import { headerString } from "./encoding-helpers.js";
import { Configurable } from "./configurable.js";
import type { Message } from "./message.js";

export class KeyProvider {
  private _keys: Key[];
  private _encryptionKey: Key | undefined;
  private _keysGroupedById: Map<string, Key[]> | undefined;

  constructor(keys: Key | Key[]) {
    this._keys = Array.isArray(keys) ? keys : [keys];
  }

  encryptionKey(): Key {
    if (!this._encryptionKey) {
      const key = this._keys[this._keys.length - 1];
      if (Configurable.config.storeKeyReferences) {
        key.publicTags.encryptedDataKeyId = key.id;
      }
      this._encryptionKey = key;
    }
    return this._encryptionKey;
  }

  decryptionKeys(message: Message): Key[] {
    // Ruby truthiness: nil and false fall back to @keys; anything else is a reference.
    const rawKeyId = message.headers.encryptedDataKeyId as unknown;
    if (rawKeyId != null && rawKeyId !== false) {
      return this.keysGroupedById().get(headerString(rawKeyId)!) ?? [];
    }
    return this._keys;
  }

  /** @internal */
  private keysGroupedById(): Map<string, Key[]> {
    if (!this._keysGroupedById) {
      this._keysGroupedById = new Map();
      for (const key of this._keys) {
        const group = this._keysGroupedById.get(key.id) ?? [];
        group.push(key);
        this._keysGroupedById.set(key.id, group);
      }
    }
    return this._keysGroupedById;
  }
}
