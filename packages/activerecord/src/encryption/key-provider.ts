import { groupBy, kernelArray } from "@blazetrails/activesupport";
import { last } from "@blazetrails/ruby-compat";
import { Key } from "./key.js";
import { headerString } from "./encoding-helpers.js";
import { Encryption } from "../namespaces.js";
import type { Message } from "./message.js";

export class KeyProvider {
  protected _keys: Key[];
  private _encryptionKey: Key | undefined;
  private _keysGroupedById: Map<string, Key[]> | undefined;

  constructor(keys: Key | Key[]) {
    this._keys = kernelArray(keys);
  }

  /** @missingRailsName keys — PERMANENT */
  encryptionKey(): Key {
    this._encryptionKey ||= ((key) => {
      if (Encryption.config.storeKeyReferences) key.publicTags.encryptedDataKeyId = key.id;
      return key;
    })(last(this._keys)!);

    return this._encryptionKey;
  }

  decryptionKeys(encryptedMessage: Message): Key[] {
    const rawKeyId = encryptedMessage.headers.encryptedDataKeyId as unknown;
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

Encryption.KeyProvider = KeyProvider;
