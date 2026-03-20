/**
 * Key provider — manages encryption/decryption keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyProvider
 */

import { Key } from "./key.js";
import type { Message } from "./message.js";

export class KeyProvider {
  private _keys: Key[];

  constructor(keys: Key | Key[]) {
    this._keys = Array.isArray(keys) ? keys : [keys];
  }

  encryptionKey(): Key {
    return this._keys[this._keys.length - 1];
  }

  decryptionKeys(message: Message): Key[] {
    const keyRef = message.headers.get("k") as string | undefined;
    if (keyRef) {
      const found = this._keys.filter((k) => k.id === keyRef);
      if (found.length > 0) return found;
    }
    return [...this._keys];
  }
}
