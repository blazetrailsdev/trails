import { kernelArray } from "@blazetrails/activesupport";
import { groupBy, last, rtest, type Hash } from "@blazetrails/ruby-compat";
import { Key } from "./key.js";
import { Encryption } from "../namespaces.js";
import type { Message } from "./message.js";

export class KeyProvider {
  protected _keys: Key[];
  private _encryptionKey: Key | undefined;
  private _keysGroupedById: Hash<string, Key[]> | undefined;

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
    if (rtest(encryptedMessage.headers.encryptedDataKeyId)) {
      return this.keysGroupedById().get(encryptedMessage.headers.encryptedDataKeyId!) ?? [];
    } else {
      return this._keys;
    }
  }

  /** @internal */
  private keysGroupedById(): Hash<string, Key[]> {
    return (this._keysGroupedById ??= groupBy(this._keys, (key) => key.id));
  }
}

Encryption.KeyProvider = KeyProvider;
