/**
 * Key provider — manages encryption/decryption keys.
 *
 * Mirrors: ActiveRecord::Encryption::KeyProvider
 */

import { Key } from "./key.js";
import type { Message } from "./message.js";

export class KeyProvider {
  private _keys: Key[];
  private _keysGroupedById: Map<string, Key[]> | undefined;

  constructor(keys: Key | Key[]) {
    this._keys = Array.isArray(keys) ? keys : [keys];
  }

  encryptionKey(): Key {
    return this._keys[this._keys.length - 1];
  }

  decryptionKeys(message: Message): Key[] {
    const keyRef = message.headers.get("k") as string | undefined;
    if (keyRef) {
      const grouped = this.keysGroupedById();
      const found = grouped.get(keyRef);
      if (found && found.length > 0) return found;
    }
    return [...this._keys];
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
