import { groupBy } from "@blazetrails/activesupport";
import { Key } from "./key.js";
import { headerString } from "./encoding-helpers.js";
import { Configurable } from "./configurable-slot.js";
import type { Message } from "./message.js";

export class KeyProvider {
  private _keys: Key[];
  private _encryptionKey: Key | undefined;
  private _keysGroupedById: Map<string, Key[]> | undefined;

  constructor(keys: Key | Key[]) {
    this._keys = Array.isArray(keys) ? keys : [keys];
  }

  /** @missingRailsCall last — PERMANENT */
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
    const rawKeyId = message.headers.encryptedDataKeyId as unknown;
    if (rawKeyId != null && rawKeyId !== false) {
      return this.keysGroupedById().get(headerString(rawKeyId)!) ?? [];
    }
    return this._keys;
  }

  /** @internal */
  private keysGroupedById(): Map<string, Key[]> {
    return (this._keysGroupedById ??= groupBy(this._keys, (key) => key.id));
  }
}
